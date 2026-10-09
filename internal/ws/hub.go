package ws

import (
	"encoding/json"
	"log"
	"net/http"
	"net/url"
	"os"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/gorilla/websocket"
)

const (
	// Time allowed to write a message to the peer.
	writeWait = 10 * time.Second
	// Time allowed to read the next pong message from the peer.
	pongWait = 60 * time.Second
	// Send pings to peer with this period. Must be less than pongWait.
	pingPeriod = (pongWait * 9) / 10
	// Maximum message size allowed from peer (clients don't send data).
	maxMessageSize = 512
)

// allowedWSOrigins holds optional extra origins (comma-separated) from the
// WS_ALLOWED_ORIGINS env var, for deployments where the WS host differs.
var allowedWSOrigins = parseAllowedOrigins(os.Getenv("WS_ALLOWED_ORIGINS"))

func parseAllowedOrigins(raw string) map[string]bool {
	out := make(map[string]bool)
	for _, o := range strings.Split(raw, ",") {
		if o = strings.TrimSpace(strings.ToLower(o)); o != "" {
			out[o] = true
		}
	}
	return out
}

// checkOrigin enforces a same-origin policy to prevent Cross-Site WebSocket
// Hijacking (CSWSH). Requests without an Origin header (non-browser clients)
// are allowed; browser requests must match the Host or an allow-listed origin.
func checkOrigin(r *http.Request) bool {
	origin := r.Header.Get("Origin")
	if origin == "" {
		return true // non-browser client (e.g. native app, curl)
	}
	u, err := url.Parse(origin)
	if err != nil {
		return false
	}
	if strings.EqualFold(u.Host, r.Host) {
		return true
	}
	return allowedWSOrigins[strings.ToLower(u.Host)]
}

var upgrader = websocket.Upgrader{
	CheckOrigin: checkOrigin,
}

// Event represents a websocket event.
type Event struct {
	Type    string          `json:"type"`
	Payload json.RawMessage `json:"payload"`
}

// userEvent is an event addressed to every connection of a single user.
type userEvent struct {
	userID uuid.UUID
	data   []byte
}

// Client represents a connected user via websocket.
type Client struct {
	ID   uuid.UUID
	Conn *websocket.Conn
	Send chan []byte
	Hub  *Hub
}

// Hub maintains the set of active clients and routes messages to them.
// The clients map is only ever touched by the Run goroutine.
type Hub struct {
	clients    map[uuid.UUID]map[*Client]struct{}
	broadcast  chan userEvent
	register   chan *Client
	unregister chan *Client
}

// NewHub creates a new hub.
func NewHub() *Hub {
	return &Hub{
		broadcast:  make(chan userEvent, 256),
		register:   make(chan *Client),
		unregister: make(chan *Client),
		clients:    make(map[uuid.UUID]map[*Client]struct{}),
	}
}

// Run starts the hub loop.
func (h *Hub) Run() {
	for {
		select {
		case client := <-h.register:
			set := h.clients[client.ID]
			if set == nil {
				set = make(map[*Client]struct{})
				h.clients[client.ID] = set
			}
			set[client] = struct{}{}

		case client := <-h.unregister:
			h.remove(client)

		case ev := <-h.broadcast:
			for client := range h.clients[ev.userID] {
				select {
				case client.Send <- ev.data:
				default:
					// Slow consumer: drop it. remove() is idempotent so a
					// later unregister from readPump is harmless.
					h.remove(client)
				}
			}
		}
	}
}

// remove unregisters a client and closes its send channel exactly once.
func (h *Hub) remove(client *Client) {
	set, ok := h.clients[client.ID]
	if !ok {
		return
	}
	if _, ok := set[client]; !ok {
		return
	}
	delete(set, client)
	close(client.Send)
	if len(set) == 0 {
		delete(h.clients, client.ID)
	}
}

// SendToUser sends an event to every connection of the given user only.
func (h *Hub) SendToUser(userID uuid.UUID, eventType string, payload interface{}) {
	raw, err := json.Marshal(payload)
	if err != nil {
		log.Printf("Error marshaling WS payload: %v", err)
		return
	}
	data, err := json.Marshal(Event{Type: eventType, Payload: raw})
	if err != nil {
		log.Printf("Error marshaling WS event: %v", err)
		return
	}
	select {
	case h.broadcast <- userEvent{userID: userID, data: data}:
	default:
		// Never block request handlers on a saturated hub; clients resync
		// on their next query anyway.
		log.Printf("WS hub saturated, dropping %s event", eventType)
	}
}

// ServeWS handles websocket requests.
func (h *Hub) ServeWS(userID uuid.UUID, w http.ResponseWriter, r *http.Request) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("WS upgrade error: %v", err)
		return
	}

	client := &Client{
		ID:   userID,
		Conn: conn,
		Send: make(chan []byte, 64),
		Hub:  h,
	}
	h.register <- client

	go client.writePump()
	go client.readPump()
}

func (c *Client) readPump() {
	defer func() {
		c.Hub.unregister <- c
		c.Conn.Close()
	}()

	c.Conn.SetReadLimit(maxMessageSize)
	c.Conn.SetReadDeadline(time.Now().Add(pongWait))
	c.Conn.SetPongHandler(func(string) error {
		return c.Conn.SetReadDeadline(time.Now().Add(pongWait))
	})

	for {
		if _, _, err := c.Conn.ReadMessage(); err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
				log.Printf("WS read error: %v", err)
			}
			return
		}
		// Clients don't send messages; anything received is ignored.
	}
}

func (c *Client) writePump() {
	ticker := time.NewTicker(pingPeriod)
	defer func() {
		ticker.Stop()
		c.Conn.Close()
	}()

	for {
		select {
		case message, ok := <-c.Send:
			c.Conn.SetWriteDeadline(time.Now().Add(writeWait))
			if !ok {
				c.Conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}
			// One frame per event so the client can JSON.parse each one.
			if err := c.Conn.WriteMessage(websocket.TextMessage, message); err != nil {
				return
			}
		case <-ticker.C:
			c.Conn.SetWriteDeadline(time.Now().Add(writeWait))
			if err := c.Conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
		}
	}
}

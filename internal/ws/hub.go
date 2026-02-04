package ws

import (
	"encoding/json"
	"log"
	"net/http"
	"sync"

	"github.com/google/uuid"
	"github.com/gorilla/websocket"
)

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool {
		return true // In production, check origin properly
	},
}

// Event represents a websocket event.
type Event struct {
	Type    string          `json:"type"`
	Payload json.RawMessage `json:"payload"`
}

// Client represents a connected user via websocket.
type Client struct {
	ID   uuid.UUID
	Conn *websocket.Conn
	Send chan []byte
	Hub  *Hub
}

// Hub maintains the set of active clients and broadcasts messages.
type Hub struct {
	// Registered clients by user ID
	clients map[uuid.UUID][]*Client
	// Broadcast channel for messages
	broadcast chan Event
	// Register requests from clients
	register chan *Client
	// Unregister requests from clients
	unregister chan *Client

	mu sync.RWMutex
}

// NewHub creates a new hub.
func NewHub() *Hub {
	return &Hub{
		broadcast:  make(chan Event),
		register:   make(chan *Client),
		unregister: make(chan *Client),
		clients:    make(map[uuid.UUID][]*Client),
	}
}

// Run starts the hub loop.
func (h *Hub) Run() {
	for {
		select {
		case client := <-h.register:
			h.mu.Lock()
			h.clients[client.ID] = append(h.clients[client.ID], client)
			h.mu.Unlock()
			log.Printf("Client registered: %s", client.ID)

		case client := <-h.unregister:
			h.mu.Lock()
			clients := h.clients[client.ID]
			for i, c := range clients {
				if c == client {
					h.clients[client.ID] = append(clients[:i], clients[i+1:]...)
					break
				}
			}
			if len(h.clients[client.ID]) == 0 {
				delete(h.clients, client.ID)
			}
			h.mu.Unlock()
			close(client.Send)
			log.Printf("Client unregistered: %s", client.ID)

		case event := <-h.broadcast:
			// For now, broadcast simple news to all clients of a specific user or global
			// But since we need user-specific notifications for feeds, we'd ideally pass UserID in Event
			// Let's enhance Event struct for this or broadcast to all for now if it's "new articles available"
			// and let them refetch.

			data, _ := json.Marshal(event)

			h.mu.RLock()
			for _, userClients := range h.clients {
				for _, client := range userClients {
					select {
					case client.Send <- data:
					default:
						// Close slow connections
						go func(c *Client) { h.unregister <- c }(client)
					}
				}
			}
			h.mu.RUnlock()
		}
	}
}

// Broadcast sends an event to all connected clients.
func (h *Hub) Broadcast(eventType string, payload interface{}) {
	data, err := json.Marshal(payload)
	if err != nil {
		log.Printf("Error marshaling broadcast payload: %v", err)
		return
	}
	h.broadcast <- Event{
		Type:    eventType,
		Payload: json.RawMessage(data),
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
		Send: make(chan []byte, 256),
		Hub:  h,
	}
	h.register <- client

	// Start goroutines for reading and writing
	go client.writePump()
	go client.readPump()
}

func (c *Client) readPump() {
	defer func() {
		c.Hub.unregister <- c
		c.Conn.Close()
	}()

	for {
		_, _, err := c.Conn.ReadMessage()
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
				log.Printf("WS read error: %v", err)
			}
			break
		}
		// We don't expect messages from client yet
	}
}

func (c *Client) writePump() {
	defer func() {
		c.Conn.Close()
	}()

	for {
		select {
		case message, ok := <-c.Send:
			if !ok {
				c.Conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}

			w, err := c.Conn.NextWriter(websocket.TextMessage)
			if err != nil {
				return
			}
			w.Write(message)

			// Add queued messages to the current writer
			n := len(c.Send)
			for i := 0; i < n; i++ {
				w.Write([]byte{'\n'})
				w.Write(<-c.Send)
			}

			if err := w.Close(); err != nil {
				return
			}
		}
	}
}

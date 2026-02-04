package handler

import (
	"log"
	"net/http"

	"github.com/michael/flowreader/internal/service"
	"github.com/michael/flowreader/internal/ws"
)

// WSHandler handles WebSocket connections.
type WSHandler struct {
	hub         *ws.Hub
	authService *service.AuthService
}

// NewWSHandler creates a new WS handler.
func NewWSHandler(hub *ws.Hub, authService *service.AuthService) *WSHandler {
	return &WSHandler{
		hub:         hub,
		authService: authService,
	}
}

// Connect handles WebSocket initiation.
func (h *WSHandler) Connect(w http.ResponseWriter, r *http.Request) {
	cookie, err := r.Cookie("session_id")
	if err != nil {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	user, err := h.authService.GetUserByToken(cookie.Value)
	if err != nil || user == nil {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	log.Printf("Setting up WS for user %s", user.ID)
	h.hub.ServeWS(user.ID, w, r)
}

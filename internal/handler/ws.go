package handler

import (
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

// Connect handles WebSocket initiation (behind RequireAuth).
func (h *WSHandler) Connect(w http.ResponseWriter, r *http.Request) {
	user := currentUser(r)
	if user == nil {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}
	h.hub.ServeWS(user.ID, w, r)
}

// Package handler contains HTTP handlers for the REST API.
package handler

import (
	"encoding/json"
	"errors"
	"net/http"

	"github.com/michael/flowreader/internal/service"
)

// AuthHandler handles authentication-related HTTP requests.
type AuthHandler struct {
	authService *service.AuthService
}

// NewAuthHandler creates a new authentication handler.
func NewAuthHandler(authService *service.AuthService) *AuthHandler {
	return &AuthHandler{authService: authService}
}

// Register handles POST /api/v1/auth/register
func (h *AuthHandler) Register(w http.ResponseWriter, r *http.Request) {
	var req service.RegisterRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	resp, err := h.authService.Register(req)
	if err != nil {
		switch {
		case errors.Is(err, service.ErrInvalidEmail):
			respondError(w, http.StatusBadRequest, "Invalid email format")
		case errors.Is(err, service.ErrPasswordTooShort):
			respondError(w, http.StatusBadRequest, "Password must be at least 8 characters")
		case errors.Is(err, service.ErrEmailAlreadyExists):
			respondError(w, http.StatusConflict, "Email already registered")
		default:
			respondError(w, http.StatusInternalServerError, "Registration failed")
		}
		return
	}

	respondJSON(w, http.StatusCreated, resp)
}

// respondJSON writes a JSON response.
func respondJSON(w http.ResponseWriter, status int, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(data)
}

// respondError writes an error response.
func respondError(w http.ResponseWriter, status int, message string) {
	respondJSON(w, status, map[string]string{"error": message})
}

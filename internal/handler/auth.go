package handler

import (
	"encoding/json"
	"errors"
	"net/http"
	"os"
	"strings"

	"github.com/michael/flowreader/internal/service"
)

// secureCookie reports whether the session cookie should carry the Secure flag.
// It honours TLS termination at a reverse proxy (X-Forwarded-Proto) and an
// explicit COOKIE_SECURE override, so HTTPS deployments behind a proxy still
// get Secure cookies even though r.TLS is nil.
func secureCookie(r *http.Request) bool {
	switch strings.ToLower(os.Getenv("COOKIE_SECURE")) {
	case "true", "1", "yes":
		return true
	case "false", "0", "no":
		return false
	}
	if r.TLS != nil {
		return true
	}
	return strings.EqualFold(r.Header.Get("X-Forwarded-Proto"), "https")
}

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
		case errors.Is(err, service.ErrPasswordTooLong):
			respondError(w, http.StatusBadRequest, "Password is too long")
		case errors.Is(err, service.ErrEmailAlreadyExists):
			respondError(w, http.StatusConflict, "Email already registered")
		case errors.Is(err, service.ErrRegistrationClosed):
			respondError(w, http.StatusForbidden, "Registration is disabled on this instance")
		default:
			respondError(w, http.StatusInternalServerError, "Registration failed")
		}
		return
	}

	respondJSON(w, http.StatusCreated, resp)
}

// Login handles POST /api/v1/auth/login
func (h *AuthHandler) Login(w http.ResponseWriter, r *http.Request) {
	var req service.LoginRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	// Add request metadata
	req.UserAgent = r.UserAgent()
	req.IPAddress = getClientIP(r)

	resp, err := h.authService.Login(req)
	if err != nil {
		if errors.Is(err, service.ErrInvalidCredentials) {
			respondError(w, http.StatusUnauthorized, "Invalid email or password")
		} else {
			respondError(w, http.StatusInternalServerError, "Login failed")
		}
		return
	}

	// Set session cookie
	http.SetCookie(w, &http.Cookie{
		Name:     "session_id",
		Value:    resp.Token,
		Path:     "/",
		Expires:  resp.ExpiresAt,
		HttpOnly: true,
		Secure:   secureCookie(r),
		SameSite: http.SameSiteStrictMode,
	})

	respondJSON(w, http.StatusOK, resp)
}

// Logout handles POST /api/v1/auth/logout
func (h *AuthHandler) Logout(w http.ResponseWriter, r *http.Request) {
	cookie, err := r.Cookie("session_id")
	if err != nil {
		respondJSON(w, http.StatusOK, map[string]string{"message": "Already logged out"})
		return
	}

	_ = h.authService.Logout(cookie.Value)

	// Clear the cookie
	http.SetCookie(w, &http.Cookie{
		Name:     "session_id",
		Value:    "",
		Path:     "/",
		MaxAge:   -1,
		HttpOnly: true,
		Secure:   secureCookie(r),
		SameSite: http.SameSiteStrictMode,
	})

	respondJSON(w, http.StatusOK, map[string]string{"message": "Logged out successfully"})
}

// Me handles GET /api/v1/users/me (behind RequireAuth).
func (h *AuthHandler) Me(w http.ResponseWriter, r *http.Request) {
	user := currentUser(r)
	respondJSON(w, http.StatusOK, service.UserInfo{
		ID:      user.ID,
		Email:   user.Email,
		IsAdmin: user.IsAdmin,
	})
}

// respondJSON writes a JSON response.
func respondJSON(w http.ResponseWriter, status int, data interface{}) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	enc := json.NewEncoder(w)
	// Safe: served as application/json with nosniff; avoids inflating HTML
	// content with \u003c escapes.
	enc.SetEscapeHTML(false)
	enc.Encode(data)
}

// respondError writes an error response.
func respondError(w http.ResponseWriter, status int, message string) {
	respondJSON(w, status, map[string]string{"error": message})
}

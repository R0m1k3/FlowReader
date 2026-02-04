package handler

import (
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/michael/flowreader/internal/domain"
	"github.com/michael/flowreader/internal/service"
)

// AdminHandler handles administrative tasks.
type AdminHandler struct {
	userRepo    domain.UserRepository
	authService *service.AuthService
}

// NewAdminHandler creates a new admin handler.
func NewAdminHandler(userRepo domain.UserRepository, authService *service.AuthService) *AdminHandler {
	return &AdminHandler{
		userRepo:    userRepo,
		authService: authService,
	}
}

// ListUsers handles GET /api/v1/admin/users
func (h *AdminHandler) ListUsers(w http.ResponseWriter, r *http.Request) {
	users, err := h.userRepo.List()
	if err != nil {
		respondError(w, http.StatusInternalServerError, "Failed to list users")
		return
	}

	respondJSON(w, http.StatusOK, users)
}

// DeleteUser handles DELETE /api/v1/admin/users/{id}
func (h *AdminHandler) DeleteUser(w http.ResponseWriter, r *http.Request) {
	userID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid user ID")
		return
	}

	// Logic to delete user and all associated data
	if err := h.userRepo.Delete(userID); err != nil {
		respondError(w, http.StatusInternalServerError, "Failed to delete user")
		return
	}

	respondJSON(w, http.StatusOK, map[string]string{"message": "User deleted successfully"})
}

// AdminOnly middleware restricts access to admins.
func (h *AdminHandler) AdminOnly(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		cookie, err := r.Cookie("session_id")
		if err != nil {
			respondError(w, http.StatusUnauthorized, "Not authenticated")
			return
		}

		user, err := h.authService.GetUserByToken(cookie.Value)
		if err != nil || user == nil {
			respondError(w, http.StatusUnauthorized, "Invalid session")
			return
		}

		if user.Role != domain.RoleAdmin {
			respondError(w, http.StatusForbidden, "Admin access required")
			return
		}

		next.ServeHTTP(w, r)
	})
}

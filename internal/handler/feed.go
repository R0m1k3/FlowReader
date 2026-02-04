package handler

import (
	"encoding/json"
	"errors"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/michael/flowreader/internal/service"
)

// FeedHandler handles feed-related HTTP requests.
type FeedHandler struct {
	feedService *service.FeedService
	authService *service.AuthService
}

// NewFeedHandler creates a new feed handler.
func NewFeedHandler(feedService *service.FeedService, authService *service.AuthService) *FeedHandler {
	return &FeedHandler{
		feedService: feedService,
		authService: authService,
	}
}

// getUserFromRequest extracts the authenticated user from the request.
func (h *FeedHandler) getUserFromRequest(r *http.Request) (uuid.UUID, error) {
	cookie, err := r.Cookie("session_id")
	if err != nil {
		return uuid.Nil, errors.New("not authenticated")
	}

	user, err := h.authService.GetUserByToken(cookie.Value)
	if err != nil || user == nil {
		return uuid.Nil, errors.New("invalid session")
	}

	return user.ID, nil
}

// List handles GET /api/v1/feeds
func (h *FeedHandler) List(w http.ResponseWriter, r *http.Request) {
	userID, err := h.getUserFromRequest(r)
	if err != nil {
		respondError(w, http.StatusUnauthorized, err.Error())
		return
	}

	feeds, err := h.feedService.GetUserFeeds(userID)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "Failed to get feeds")
		return
	}

	respondJSON(w, http.StatusOK, feeds)
}

// Add handles POST /api/v1/feeds
func (h *FeedHandler) Add(w http.ResponseWriter, r *http.Request) {
	userID, err := h.getUserFromRequest(r)
	if err != nil {
		respondError(w, http.StatusUnauthorized, err.Error())
		return
	}

	var req service.AddFeedRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "Invalid request body")
		return
	}
	req.UserID = userID

	resp, err := h.feedService.AddFeed(req)
	if err != nil {
		switch {
		case errors.Is(err, service.ErrInvalidURL):
			respondError(w, http.StatusBadRequest, "Invalid URL format")
		case errors.Is(err, service.ErrFeedExists):
			respondError(w, http.StatusConflict, "Feed already exists")
		default:
			respondError(w, http.StatusInternalServerError, "Failed to add feed")
		}
		return
	}

	respondJSON(w, http.StatusCreated, resp)
}

// Get handles GET /api/v1/feeds/{id}
func (h *FeedHandler) Get(w http.ResponseWriter, r *http.Request) {
	userID, err := h.getUserFromRequest(r)
	if err != nil {
		respondError(w, http.StatusUnauthorized, err.Error())
		return
	}

	feedID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid feed ID")
		return
	}

	feed, err := h.feedService.GetFeed(feedID, userID)
	if err != nil {
		switch {
		case errors.Is(err, service.ErrFeedNotFound):
			respondError(w, http.StatusNotFound, "Feed not found")
		case errors.Is(err, service.ErrUnauthorized):
			respondError(w, http.StatusForbidden, "Access denied")
		default:
			respondError(w, http.StatusInternalServerError, "Failed to get feed")
		}
		return
	}

	respondJSON(w, http.StatusOK, feed)
}

// Delete handles DELETE /api/v1/feeds/{id}
func (h *FeedHandler) Delete(w http.ResponseWriter, r *http.Request) {
	userID, err := h.getUserFromRequest(r)
	if err != nil {
		respondError(w, http.StatusUnauthorized, err.Error())
		return
	}

	feedID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid feed ID")
		return
	}

	err = h.feedService.DeleteFeed(feedID, userID)
	if err != nil {
		switch {
		case errors.Is(err, service.ErrFeedNotFound):
			respondError(w, http.StatusNotFound, "Feed not found")
		case errors.Is(err, service.ErrUnauthorized):
			respondError(w, http.StatusForbidden, "Access denied")
		default:
			respondError(w, http.StatusInternalServerError, "Failed to delete feed")
		}
		return
	}

	respondJSON(w, http.StatusOK, map[string]string{"message": "Feed deleted"})
}

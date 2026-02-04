package handler

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/michael/flowreader/internal/opml"
	"github.com/michael/flowreader/internal/service"
)

// FeedHandler handles feed-related HTTP requests.
type FeedHandler struct {
	feedService  *service.FeedService
	fetchService *service.FetchService
	authService  *service.AuthService
}

// NewFeedHandler creates a new feed handler.
func NewFeedHandler(feedService *service.FeedService, fetchService *service.FetchService, authService *service.AuthService) *FeedHandler {
	return &FeedHandler{
		feedService:  feedService,
		fetchService: fetchService,
		authService:  authService,
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

	// Trigger immediate fetch in background
	go func() {
		ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
		defer cancel()
		_ = h.fetchService.FetchFeed(ctx, resp.ID)
	}()

	respondJSON(w, http.StatusCreated, resp)
}

// Refresh handles POST /api/v1/feeds/refresh
func (h *FeedHandler) Refresh(w http.ResponseWriter, r *http.Request) {
	userID, err := h.getUserFromRequest(r)
	if err != nil {
		respondError(w, http.StatusUnauthorized, err.Error())
		return
	}

	// For now, we refresh all feeds for the user synchronously or in background
	// Let's do background and return 202 Accepted
	go func() {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Minute)
		defer cancel()

		feeds, _ := h.feedService.GetUserFeeds(userID)
		for _, f := range feeds {
			_ = h.fetchService.FetchFeed(ctx, f.ID)
		}
	}()

	respondJSON(w, http.StatusAccepted, map[string]string{"message": "Refresh started"})
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

// ImportOPML handles POST /api/v1/feeds/import/opml
func (h *FeedHandler) ImportOPML(w http.ResponseWriter, r *http.Request) {
	userID, err := h.getUserFromRequest(r)
	if err != nil {
		respondError(w, http.StatusUnauthorized, err.Error())
		return
	}

	// Parse multipart form (max 10MB)
	if err := r.ParseMultipartForm(10 << 20); err != nil {
		respondError(w, http.StatusBadRequest, "Invalid form data")
		return
	}

	file, _, err := r.FormFile("file")
	if err != nil {
		respondError(w, http.StatusBadRequest, "No file provided")
		return
	}
	defer file.Close()

	// Parse OPML
	feeds, err := opml.Parse(file)
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid OPML file: "+err.Error())
		return
	}

	// Convert to service format
	var opmlFeeds []service.OPMLFeedInfo
	for _, f := range feeds {
		opmlFeeds = append(opmlFeeds, service.OPMLFeedInfo{
			URL:     f.URL,
			Title:   f.Title,
			SiteURL: f.SiteURL,
		})
	}

	// Import feeds
	result, err := h.feedService.ImportOPML(userID, opmlFeeds)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "Import failed")
		return
	}

	respondJSON(w, http.StatusOK, result)
}

// ExportOPML handles GET /api/v1/feeds/export/opml
func (h *FeedHandler) ExportOPML(w http.ResponseWriter, r *http.Request) {
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

	// Convert to OPML format
	var opmlFeeds []opml.FeedInfo
	for _, f := range feeds {
		opmlFeeds = append(opmlFeeds, opml.FeedInfo{
			URL:     f.URL,
			Title:   f.Title,
			SiteURL: f.SiteURL,
		})
	}

	// Generate OPML
	data, err := opml.Generate("FlowReader Feeds", opmlFeeds)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "Failed to generate OPML")
		return
	}

	w.Header().Set("Content-Type", "application/xml")
	w.Header().Set("Content-Disposition", "attachment; filename=flowreader-feeds.opml")
	w.Write(data)
}

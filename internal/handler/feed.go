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

// getUserFromRequest returns the user resolved by RequireAuth.
func (h *FeedHandler) getUserFromRequest(r *http.Request) (uuid.UUID, error) {
	if u := currentUser(r); u != nil {
		return u.ID, nil
	}
	return uuid.Nil, errors.New("not authenticated")
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
		ctx, cancel := context.WithTimeout(context.Background(), time.Minute)
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

	// Runs in the background through the shared worker pool; concurrent
	// clicks for the same user are coalesced and recently fetched feeds skipped.
	started := h.fetchService.RefreshUser(userID)
	if !started {
		respondJSON(w, http.StatusAccepted, map[string]string{"message": "Refresh already running"})
		return
	}
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

// UpdateRequest represents the request body for updating a feed.
type UpdateRequest struct {
	Title string `json:"title"`
}

// Update handles PATCH /api/v1/feeds/{id}
func (h *FeedHandler) Update(w http.ResponseWriter, r *http.Request) {
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

	var req UpdateRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	if req.Title == "" {
		respondError(w, http.StatusBadRequest, "Title is required")
		return
	}

	feed, err := h.feedService.UpdateFeed(feedID, userID, req.Title)
	if err != nil {
		switch {
		case errors.Is(err, service.ErrFeedNotFound):
			respondError(w, http.StatusNotFound, "Feed not found")
		case errors.Is(err, service.ErrUnauthorized):
			respondError(w, http.StatusForbidden, "Access denied")
		default:
			respondError(w, http.StatusInternalServerError, "Failed to update feed")
		}
		return
	}

	respondJSON(w, http.StatusOK, feed)
}

// ImportOPML handles POST /api/v1/feeds/import/opml
func (h *FeedHandler) ImportOPML(w http.ResponseWriter, r *http.Request) {
	userID, err := h.getUserFromRequest(r)
	if err != nil {
		respondError(w, http.StatusUnauthorized, err.Error())
		return
	}

	// Parse multipart form (body already capped by the router; keep it in memory)
	if err := r.ParseMultipartForm(5 << 20); err != nil {
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
		respondError(w, http.StatusBadRequest, "Invalid OPML file")
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
		if errors.Is(err, service.ErrTooManyFeeds) {
			respondError(w, http.StatusBadRequest, err.Error())
			return
		}
		respondError(w, http.StatusInternalServerError, "Import failed")
		return
	}

	// Fetch the newly imported feeds right away.
	if result.Imported > 0 {
		h.fetchService.RefreshUser(userID)
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

package handler

import (
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/michael/flowreader/internal/domain"
	"github.com/michael/flowreader/internal/service"
	"github.com/michael/flowreader/internal/utils"
	"github.com/michael/flowreader/internal/ws"
)

// ArticleHandler handles article-related HTTP requests.
type ArticleHandler struct {
	articleRepo domain.ArticleRepository
	feedService *service.FeedService
	authService *service.AuthService
	sanitizer   *utils.ContentSanitizer
	hub         *ws.Hub
}

// NewArticleHandler creates a new article handler.
func NewArticleHandler(articleRepo domain.ArticleRepository, feedService *service.FeedService, authService *service.AuthService, hub *ws.Hub) *ArticleHandler {
	return &ArticleHandler{
		articleRepo: articleRepo,
		feedService: feedService,
		authService: authService,
		sanitizer:   utils.NewContentSanitizer(),
		hub:         hub,
	}
}

// getUserFromRequest extracts the authenticated user from the request.
func (h *ArticleHandler) getUserFromRequest(r *http.Request) (uuid.UUID, error) {
	cookie, err := r.Cookie("session_id")
	if err != nil {
		return uuid.Nil, err
	}

	user, err := h.authService.GetUserByToken(cookie.Value)
	if err != nil || user == nil {
		return uuid.Nil, err
	}

	return user.ID, nil
}

// List handles GET /api/v1/articles
func (h *ArticleHandler) List(w http.ResponseWriter, r *http.Request) {
	userID, err := h.getUserFromRequest(r)
	if err != nil {
		respondError(w, http.StatusUnauthorized, "Not authenticated")
		return
	}

	// Parse query parameters
	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	if limit <= 0 || limit > 100 {
		limit = 50
	}

	offset, _ := strconv.Atoi(r.URL.Query().Get("offset"))
	if offset < 0 {
		offset = 0
	}

	unreadOnly := r.URL.Query().Get("unread") == "true"

	articles, err := h.articleRepo.GetByUserID(userID, limit, offset, unreadOnly)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "Failed to get articles")
		return
	}

	respondJSON(w, http.StatusOK, articles)
}

// ListByFeed handles GET /api/v1/feeds/{id}/articles
func (h *ArticleHandler) ListByFeed(w http.ResponseWriter, r *http.Request) {
	userID, err := h.getUserFromRequest(r)
	if err != nil {
		respondError(w, http.StatusUnauthorized, "Not authenticated")
		return
	}

	feedID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid feed ID")
		return
	}

	// Verify feed ownership
	_, err = h.feedService.GetFeed(feedID, userID)
	if err != nil {
		respondError(w, http.StatusForbidden, "Access denied")
		return
	}

	// Parse query parameters
	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	if limit <= 0 || limit > 100 {
		limit = 50
	}

	offset, _ := strconv.Atoi(r.URL.Query().Get("offset"))
	if offset < 0 {
		offset = 0
	}

	articles, err := h.articleRepo.GetByFeedID(feedID, limit, offset)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "Failed to get articles")
		return
	}

	respondJSON(w, http.StatusOK, articles)
}

// Get handles GET /api/v1/articles/{id}
func (h *ArticleHandler) Get(w http.ResponseWriter, r *http.Request) {
	userID, err := h.getUserFromRequest(r)
	if err != nil {
		respondError(w, http.StatusUnauthorized, "Not authenticated")
		return
	}

	articleID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid article ID")
		return
	}

	article, err := h.articleRepo.GetByID(articleID)
	if err != nil || article == nil {
		respondError(w, http.StatusNotFound, "Article not found")
		return
	}

	// Verify feed ownership
	_, err = h.feedService.GetFeed(article.FeedID, userID)
	if err != nil {
		respondError(w, http.StatusForbidden, "Access denied")
		return
	}

	// Sanitize content
	if article.Content != "" {
		article.Content = h.sanitizer.Sanitize(article.Content)
	} else if article.Summary != "" {
		article.Summary = h.sanitizer.Sanitize(article.Summary)
	}

	respondJSON(w, http.StatusOK, article)
}

// MarkRead handles POST /api/v1/articles/{id}/read
func (h *ArticleHandler) MarkRead(w http.ResponseWriter, r *http.Request) {
	userID, err := h.getUserFromRequest(r)
	if err != nil {
		respondError(w, http.StatusUnauthorized, "Not authenticated")
		return
	}

	articleID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid article ID")
		return
	}

	article, err := h.articleRepo.GetByID(articleID)
	if err != nil || article == nil {
		respondError(w, http.StatusNotFound, "Article not found")
		return
	}

	// Verify feed ownership
	_, err = h.feedService.GetFeed(article.FeedID, userID)
	if err != nil {
		respondError(w, http.StatusForbidden, "Access denied")
		return
	}

	if err := h.articleRepo.MarkAsRead(articleID); err != nil {
		respondError(w, http.StatusInternalServerError, "Failed to mark as read")
		return
	}

	// Broadcast update
	if h.hub != nil {
		h.hub.Broadcast("article_updated", map[string]interface{}{
			"id":      articleID,
			"is_read": true,
		})
	}

	respondJSON(w, http.StatusOK, map[string]bool{"is_read": true})
}

// MarkUnread handles DELETE /api/v1/articles/{id}/read
func (h *ArticleHandler) MarkUnread(w http.ResponseWriter, r *http.Request) {
	userID, err := h.getUserFromRequest(r)
	if err != nil {
		respondError(w, http.StatusUnauthorized, "Not authenticated")
		return
	}

	articleID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid article ID")
		return
	}

	article, err := h.articleRepo.GetByID(articleID)
	if err != nil || article == nil {
		respondError(w, http.StatusNotFound, "Article not found")
		return
	}

	// Verify feed ownership
	_, err = h.feedService.GetFeed(article.FeedID, userID)
	if err != nil {
		respondError(w, http.StatusForbidden, "Access denied")
		return
	}

	if err := h.articleRepo.MarkAsUnread(articleID); err != nil {
		respondError(w, http.StatusInternalServerError, "Failed to mark as unread")
		return
	}

	// Broadcast update
	if h.hub != nil {
		h.hub.Broadcast("article_updated", map[string]interface{}{
			"id":      articleID,
			"is_read": false,
		})
	}

	respondJSON(w, http.StatusOK, map[string]bool{"is_read": false})
}

// ToggleFavorite handles POST /api/v1/articles/{id}/favorite
func (h *ArticleHandler) ToggleFavorite(w http.ResponseWriter, r *http.Request) {
	userID, err := h.getUserFromRequest(r)
	if err != nil {
		respondError(w, http.StatusUnauthorized, "Not authenticated")
		return
	}

	articleID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid article ID")
		return
	}

	article, err := h.articleRepo.GetByID(articleID)
	if err != nil || article == nil {
		respondError(w, http.StatusNotFound, "Article not found")
		return
	}

	// Verify feed ownership
	_, err = h.feedService.GetFeed(article.FeedID, userID)
	if err != nil {
		respondError(w, http.StatusForbidden, "Access denied")
		return
	}

	if err := h.articleRepo.ToggleFavorite(articleID); err != nil {
		respondError(w, http.StatusInternalServerError, "Failed to toggle favorite")
		return
	}

	// Broadcast update
	if h.hub != nil {
		h.hub.Broadcast("article_updated", map[string]interface{}{
			"id":          articleID,
			"is_favorite": !article.IsFavorite,
		})
	}

	respondJSON(w, http.StatusOK, map[string]bool{"is_favorite": !article.IsFavorite})
}

// MarkAllRead handles POST /api/v1/feeds/{id}/read-all
func (h *ArticleHandler) MarkAllRead(w http.ResponseWriter, r *http.Request) {
	userID, err := h.getUserFromRequest(r)
	if err != nil {
		respondError(w, http.StatusUnauthorized, "Not authenticated")
		return
	}

	feedID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid feed ID")
		return
	}

	// Verify feed ownership
	_, err = h.feedService.GetFeed(feedID, userID)
	if err != nil {
		respondError(w, http.StatusForbidden, "Access denied")
		return
	}

	if err := h.articleRepo.MarkAllAsRead(feedID); err != nil {
		respondError(w, http.StatusInternalServerError, "Failed to mark all as read")
		return
	}

	respondJSON(w, http.StatusOK, map[string]string{"message": "All articles marked as read"})
}

// MarkAllReadGlobal handles POST /api/v1/articles/read-all
func (h *ArticleHandler) MarkAllReadGlobal(w http.ResponseWriter, r *http.Request) {
	userID, err := h.getUserFromRequest(r)
	if err != nil {
		respondError(w, http.StatusUnauthorized, "Not authenticated")
		return
	}

	if err := h.articleRepo.MarkAllAsReadGlobal(userID); err != nil {
		respondError(w, http.StatusInternalServerError, "Failed to mark all as read")
		return
	}

	respondJSON(w, http.StatusOK, map[string]string{"message": "All articles marked as read"})
}

// GetFavorites handles GET /api/v1/articles/favorites
func (h *ArticleHandler) GetFavorites(w http.ResponseWriter, r *http.Request) {
	userID, err := h.getUserFromRequest(r)
	if err != nil {
		respondError(w, http.StatusUnauthorized, "Not authenticated")
		return
	}

	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	if limit <= 0 || limit > 100 {
		limit = 50
	}

	offset, _ := strconv.Atoi(r.URL.Query().Get("offset"))
	if offset < 0 {
		offset = 0
	}

	articles, err := h.articleRepo.GetFavorites(userID, limit, offset)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "Failed to get favorites")
		return
	}

	respondJSON(w, http.StatusOK, articles)
}

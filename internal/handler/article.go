package handler

import (
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/michael/flowreader/internal/domain"
	"github.com/michael/flowreader/internal/service"
	"github.com/michael/flowreader/internal/utils"
	"github.com/michael/flowreader/internal/ws"
)

// ArticleHandler handles article-related HTTP requests. All routes run
// behind RequireAuth; ownership is enforced inside each SQL statement.
type ArticleHandler struct {
	articleRepo domain.ArticleRepository
	aiService   *service.AIService
	sanitizer   *utils.ContentSanitizer
	extractor   *utils.ContentExtractor
	hub         *ws.Hub
}

// NewArticleHandler creates a new article handler.
func NewArticleHandler(articleRepo domain.ArticleRepository, aiService *service.AIService, hub *ws.Hub) *ArticleHandler {
	return &ArticleHandler{
		articleRepo: articleRepo,
		aiService:   aiService,
		sanitizer:   utils.NewContentSanitizer(),
		extractor:   utils.NewContentExtractor(),
		hub:         hub,
	}
}

// notify pushes an event to the acting user's other tabs/devices only.
func (h *ArticleHandler) notify(userID uuid.UUID, eventType string, payload any) {
	if h.hub != nil {
		h.hub.SendToUser(userID, eventType, payload)
	}
}

func parseLimit(r *http.Request) int {
	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	if limit <= 0 || limit > 100 {
		limit = 30
	}
	return limit
}

// parseCursor reads ?cursor=<RFC3339 sort_at>,<uuid> (the last item of the
// previous page). A missing cursor means the first page.
func parseCursor(r *http.Request) (*domain.ArticleCursor, bool) {
	raw := r.URL.Query().Get("cursor")
	if raw == "" {
		return nil, true
	}
	ts, id, ok := strings.Cut(raw, ",")
	if !ok {
		return nil, false
	}
	sortAt, err := time.Parse(time.RFC3339Nano, ts)
	if err != nil {
		return nil, false
	}
	uid, err := uuid.Parse(id)
	if err != nil {
		return nil, false
	}
	return &domain.ArticleCursor{SortAt: sortAt, ID: uid}, true
}

func (h *ArticleHandler) list(w http.ResponseWriter, r *http.Request, f domain.ArticleFilter) {
	cursor, ok := parseCursor(r)
	if !ok {
		respondError(w, http.StatusBadRequest, "Invalid cursor")
		return
	}
	f.UserID = currentUser(r).ID
	f.Cursor = cursor
	f.Limit = parseLimit(r)
	f.UnreadOnly = f.UnreadOnly || r.URL.Query().Get("unread") == "true"

	articles, err := h.articleRepo.List(r.Context(), f)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "Failed to get articles")
		return
	}
	respondJSON(w, http.StatusOK, articles)
}

// List handles GET /api/v1/articles
func (h *ArticleHandler) List(w http.ResponseWriter, r *http.Request) {
	h.list(w, r, domain.ArticleFilter{})
}

// ListByFeed handles GET /api/v1/feeds/{id}/articles
func (h *ArticleHandler) ListByFeed(w http.ResponseWriter, r *http.Request) {
	feedID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid feed ID")
		return
	}
	h.list(w, r, domain.ArticleFilter{FeedID: &feedID})
}

// GetFavorites handles GET /api/v1/articles/favorites
func (h *ArticleHandler) GetFavorites(w http.ResponseWriter, r *http.Request) {
	h.list(w, r, domain.ArticleFilter{FavoritesOnly: true})
}

// Search handles GET /api/v1/articles/search
func (h *ArticleHandler) Search(w http.ResponseWriter, r *http.Request) {
	query := strings.TrimSpace(r.URL.Query().Get("q"))
	if query == "" {
		respondJSON(w, http.StatusOK, []*domain.Article{})
		return
	}
	query = utils.TruncateRunes(query, 200)

	offset, _ := strconv.Atoi(r.URL.Query().Get("offset"))
	if offset < 0 || offset > 10000 {
		offset = 0
	}

	articles, err := h.articleRepo.Search(r.Context(), currentUser(r).ID, query, parseLimit(r), offset)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "Failed to search articles")
		return
	}
	respondJSON(w, http.StatusOK, articles)
}

// Get handles GET /api/v1/articles/{id} and returns the full content.
func (h *ArticleHandler) Get(w http.ResponseWriter, r *http.Request) {
	articleID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid article ID")
		return
	}

	article, err := h.articleRepo.GetForUser(r.Context(), articleID, currentUser(r).ID)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "Failed to get article")
		return
	}
	if article == nil {
		respondError(w, http.StatusNotFound, "Article not found")
		return
	}

	// Content is sanitized at ingest; sanitizing again here is cheap for a
	// single article and keeps defence in depth for rows not yet backfilled.
	article.Content = h.sanitizer.Sanitize(article.Content)
	article.Summary = h.sanitizer.Sanitize(article.Summary)

	w.Header().Set("Cache-Control", "private, no-cache")
	respondJSON(w, http.StatusOK, article)
}

func (h *ArticleHandler) setRead(w http.ResponseWriter, r *http.Request, read bool) {
	articleID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid article ID")
		return
	}
	userID := currentUser(r).ID

	found, err := h.articleRepo.SetRead(r.Context(), articleID, userID, read)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "Failed to update article")
		return
	}
	if !found {
		respondError(w, http.StatusNotFound, "Article not found")
		return
	}

	h.notify(userID, "article_updated", map[string]any{"id": articleID, "is_read": read})
	respondJSON(w, http.StatusOK, map[string]bool{"is_read": read})
}

// MarkRead handles POST /api/v1/articles/{id}/read
func (h *ArticleHandler) MarkRead(w http.ResponseWriter, r *http.Request) { h.setRead(w, r, true) }

// MarkUnread handles DELETE /api/v1/articles/{id}/read
func (h *ArticleHandler) MarkUnread(w http.ResponseWriter, r *http.Request) { h.setRead(w, r, false) }

// ToggleFavorite handles POST /api/v1/articles/{id}/favorite
func (h *ArticleHandler) ToggleFavorite(w http.ResponseWriter, r *http.Request) {
	articleID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid article ID")
		return
	}
	userID := currentUser(r).ID

	fav, found, err := h.articleRepo.ToggleFavorite(r.Context(), articleID, userID)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "Failed to toggle favorite")
		return
	}
	if !found {
		respondError(w, http.StatusNotFound, "Article not found")
		return
	}

	h.notify(userID, "article_updated", map[string]any{"id": articleID, "is_favorite": fav})
	respondJSON(w, http.StatusOK, map[string]bool{"is_favorite": fav})
}

// MarkAllRead handles POST /api/v1/feeds/{id}/read-all
func (h *ArticleHandler) MarkAllRead(w http.ResponseWriter, r *http.Request) {
	feedID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid feed ID")
		return
	}
	userID := currentUser(r).ID

	n, err := h.articleRepo.MarkFeedRead(r.Context(), feedID, userID)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "Failed to mark all as read")
		return
	}
	if n > 0 {
		h.notify(userID, "articles_bulk_read", map[string]any{"feed_id": feedID})
	}
	respondJSON(w, http.StatusOK, map[string]any{"message": "All articles marked as read", "count": n})
}

// MarkAllReadGlobal handles POST /api/v1/articles/read-all
func (h *ArticleHandler) MarkAllReadGlobal(w http.ResponseWriter, r *http.Request) {
	userID := currentUser(r).ID
	n, err := h.articleRepo.MarkAllRead(r.Context(), userID)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "Failed to mark all as read")
		return
	}
	if n > 0 {
		h.notify(userID, "articles_bulk_read", map[string]any{})
	}
	respondJSON(w, http.StatusOK, map[string]any{"message": "All articles marked as read", "count": n})
}

// Summarize handles POST /api/v1/articles/{id}/summarize
func (h *ArticleHandler) Summarize(w http.ResponseWriter, r *http.Request) {
	articleID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid article ID")
		return
	}
	userID := currentUser(r).ID

	article, err := h.articleRepo.GetForUser(r.Context(), articleID, userID)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "Failed to get article")
		return
	}
	if article == nil {
		respondError(w, http.StatusNotFound, "Article not found")
		return
	}

	// If already summarized, return it
	if article.AISummary != "" {
		respondJSON(w, http.StatusOK, map[string]string{"summary": article.AISummary})
		return
	}
	if !h.aiService.Enabled() {
		respondError(w, http.StatusServiceUnavailable, "AI summaries are not configured")
		return
	}

	// Summaries take an extractor fetch plus an LLM call: allow more than the
	// server's default write deadline for this route only.
	_ = http.NewResponseController(w).SetWriteDeadline(time.Now().Add(90 * time.Second))

	content := utils.PlainText(article.Content)
	if content == "" {
		content = utils.PlainText(article.Summary)
	}

	// Try to extract full content from URL if available
	if article.URL != "" {
		fullContent, err := h.extractor.Extract(r.Context(), article.URL)
		if err == nil && len(fullContent) > len(content) {
			content = fullContent
		}
	}

	summary, err := h.aiService.Summarize(r.Context(), "Titre : "+article.Title+"\n\n"+content)
	if err != nil {
		respondError(w, http.StatusBadGateway, "Failed to generate summary")
		return
	}

	if err := h.articleRepo.UpdateAISummary(r.Context(), articleID, summary); err != nil {
		respondError(w, http.StatusInternalServerError, "Failed to persist summary")
		return
	}

	h.notify(userID, "article_updated", map[string]any{"id": articleID, "ai_summary": summary})
	respondJSON(w, http.StatusOK, map[string]string{"summary": summary})
}

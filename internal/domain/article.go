package domain

import (
	"context"
	"time"

	"github.com/google/uuid"
)

// Article represents an item from an RSS/Atom feed.
type Article struct {
	ID          uuid.UUID  `json:"id"`
	FeedID      uuid.UUID  `json:"feed_id"`
	GUID        string     `json:"guid,omitempty"`
	Title       string     `json:"title"`
	URL         string     `json:"url,omitempty"`
	Content     string     `json:"content,omitempty"`
	Summary     string     `json:"summary,omitempty"`
	Excerpt     string     `json:"excerpt,omitempty"`
	AISummary   string     `json:"ai_summary,omitempty"`
	Author      string     `json:"author,omitempty"`
	ImageURL    string     `json:"image_url,omitempty"`
	PublishedAt *time.Time `json:"published_at,omitempty"`
	SortAt      time.Time  `json:"sort_at"`
	IsRead      bool       `json:"is_read"`
	IsFavorite  bool       `json:"is_favorite"`
	ReadAt      *time.Time `json:"read_at,omitempty"`
	CreatedAt   time.Time  `json:"created_at"`
	WordCount   int        `json:"word_count"`
	ReadingTime int        `json:"reading_time"`

	// Virtual fields (from joins)
	FeedTitle string `json:"feed_title,omitempty"`
}

// ArticleCursor is a keyset pagination position: the (sort_at, id) of the
// last article of the previous page.
type ArticleCursor struct {
	SortAt time.Time
	ID     uuid.UUID
}

// ArticleFilter selects a page of a user's articles, newest first.
type ArticleFilter struct {
	UserID        uuid.UUID
	FeedID        *uuid.UUID
	UnreadOnly    bool
	FavoritesOnly bool
	Cursor        *ArticleCursor
	Limit         int
}

// ArticleRepository defines the interface for article data access.
// Every user-facing operation is scoped by user ID so ownership is enforced
// in SQL rather than by a separate lookup.
type ArticleRepository interface {
	// InsertNew inserts the articles whose GUID is not already stored for the
	// feed and returns how many rows were actually inserted.
	InsertNew(ctx context.Context, feedID uuid.UUID, articles []*Article) (int, error)
	ExistingGUIDs(ctx context.Context, feedID uuid.UUID, guids []string) (map[string]struct{}, error)
	GetForUser(ctx context.Context, id, userID uuid.UUID) (*Article, error)
	List(ctx context.Context, f ArticleFilter) ([]*Article, error)
	Search(ctx context.Context, userID uuid.UUID, query string, limit, offset int) ([]*Article, error)
	// SetRead returns false when the article doesn't exist or isn't owned by the user.
	SetRead(ctx context.Context, id, userID uuid.UUID, read bool) (bool, error)
	// ToggleFavorite returns the new favorite state and whether the article was found.
	ToggleFavorite(ctx context.Context, id, userID uuid.UUID) (isFavorite bool, found bool, err error)
	MarkFeedRead(ctx context.Context, feedID, userID uuid.UUID) (int64, error)
	MarkAllRead(ctx context.Context, userID uuid.UUID) (int64, error)
	UpdateAISummary(ctx context.Context, id uuid.UUID, summary string) error
	DeleteOldArticles(ctx context.Context, olderThan time.Duration) (int64, error)
}

package domain

import (
	"time"

	"github.com/google/uuid"
)

// Article represents an item from an RSS/Atom feed.
type Article struct {
	ID          uuid.UUID  `json:"id"`
	FeedID      uuid.UUID  `json:"feed_id"`
	GUID        string     `json:"guid"`
	Title       string     `json:"title"`
	URL         string     `json:"url,omitempty"`
	Content     string     `json:"content,omitempty"`
	Summary     string     `json:"summary,omitempty"`
	Author      string     `json:"author,omitempty"`
	ImageURL    string     `json:"image_url,omitempty"`
	PublishedAt *time.Time `json:"published_at,omitempty"`
	IsRead      bool       `json:"is_read"`
	IsFavorite  bool       `json:"is_favorite"`
	ReadAt      *time.Time `json:"read_at,omitempty"`
	CreatedAt   time.Time  `json:"created_at"`

	// Virtual fields (from joins)
	FeedTitle string `json:"feed_title,omitempty"`
}

// ArticleRepository defines the interface for article data access.
type ArticleRepository interface {
	Create(article *Article) error
	CreateBatch(articles []*Article) error
	GetByID(id uuid.UUID) (*Article, error)
	GetByFeedID(feedID uuid.UUID, limit, offset int) ([]*Article, error)
	GetByUserID(userID uuid.UUID, limit, offset int, unreadOnly bool) ([]*Article, error)
	GetByGUID(feedID uuid.UUID, guid string) (*Article, error)
	MarkAsRead(id uuid.UUID) error
	MarkAsUnread(id uuid.UUID) error
	MarkAllAsRead(feedID uuid.UUID) error
	ToggleFavorite(id uuid.UUID) error
	GetFavorites(userID uuid.UUID, limit, offset int) ([]*Article, error)
	CountUnread(feedID uuid.UUID) (int, error)
}

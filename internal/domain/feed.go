package domain

import (
	"time"

	"github.com/google/uuid"
)

// Feed represents an RSS/Atom feed subscription.
type Feed struct {
	ID            uuid.UUID  `json:"id"`
	UserID        uuid.UUID  `json:"user_id"`
	URL           string     `json:"url"`
	Title         string     `json:"title"`
	Description   string     `json:"description,omitempty"`
	SiteURL       string     `json:"site_url,omitempty"`
	ImageURL      string     `json:"image_url,omitempty"`
	LastFetchedAt *time.Time `json:"last_fetched_at,omitempty"`
	FetchError    string     `json:"fetch_error,omitempty"`
	CreatedAt     time.Time  `json:"created_at"`
	UpdatedAt     time.Time  `json:"updated_at"`

	// Virtual fields (not in DB)
	UnreadCount int `json:"unread_count,omitempty"`
}

// FeedRepository defines the interface for feed data access.
type FeedRepository interface {
	Create(feed *Feed) error
	GetByID(id uuid.UUID) (*Feed, error)
	GetByUserID(userID uuid.UUID) ([]*Feed, error)
	GetByURL(userID uuid.UUID, url string) (*Feed, error)
	Update(feed *Feed) error
	Delete(id uuid.UUID) error
	GetFeedsToFetch(limit int) ([]*Feed, error)
	UpdateFetchStatus(id uuid.UUID, fetchedAt time.Time, fetchError string) error
}

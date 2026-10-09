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

	// Fetch state (HTTP conditional GET + error backoff); not exposed.
	ETag         string     `json:"-"`
	LastModified string     `json:"-"`
	ErrorCount   int        `json:"-"`
	NextFetchAt  *time.Time `json:"-"`

	// Virtual fields (not in DB)
	UnreadCount int `json:"unread_count"`
}

// FetchResult is the outcome of one fetch attempt, persisted in one statement.
type FetchResult struct {
	FetchedAt    time.Time
	NextFetchAt  time.Time
	Error        string // empty on success
	ErrorCount   int
	ETag         string
	LastModified string
	// Metadata from the feed document; nil when the feed wasn't (re)parsed.
	Title       *string
	Description *string
	SiteURL     *string
	ImageURL    *string
}

// FeedRepository defines the interface for feed data access.
type FeedRepository interface {
	Create(feed *Feed) error
	GetByID(id uuid.UUID) (*Feed, error)
	GetByUserID(userID uuid.UUID) ([]*Feed, error)
	GetByURL(userID uuid.UUID, url string) (*Feed, error)
	Update(feed *Feed) error
	Delete(id uuid.UUID) error
	// GetFeedsToFetch returns feeds whose next fetch is due.
	GetFeedsToFetch(limit int) ([]*Feed, error)
	SaveFetchResult(id uuid.UUID, res FetchResult) error
}

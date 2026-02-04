package service

import (
	"errors"
	"fmt"
	"net/url"
	"time"

	"github.com/google/uuid"
	"github.com/michael/flowreader/internal/domain"
)

// Feed service errors
var (
	ErrInvalidURL   = errors.New("invalid feed URL")
	ErrFeedExists   = errors.New("feed already exists")
	ErrFeedNotFound = errors.New("feed not found")
	ErrUnauthorized = errors.New("unauthorized access")
)

// FeedService handles feed-related business logic.
type FeedService struct {
	feedRepo domain.FeedRepository
}

// NewFeedService creates a new feed service.
func NewFeedService(feedRepo domain.FeedRepository) *FeedService {
	return &FeedService{feedRepo: feedRepo}
}

// AddFeedRequest contains the data needed to add a new feed.
type AddFeedRequest struct {
	URL    string    `json:"url"`
	UserID uuid.UUID `json:"-"`
}

// AddFeedResponse contains the created feed data.
type AddFeedResponse struct {
	ID        uuid.UUID `json:"id"`
	URL       string    `json:"url"`
	Title     string    `json:"title"`
	CreatedAt time.Time `json:"created_at"`
}

// AddFeed creates a new feed subscription.
func (s *FeedService) AddFeed(req AddFeedRequest) (*AddFeedResponse, error) {
	// Validate URL
	parsedURL, err := url.ParseRequestURI(req.URL)
	if err != nil || (parsedURL.Scheme != "http" && parsedURL.Scheme != "https") {
		return nil, ErrInvalidURL
	}

	// Normalize URL
	normalizedURL := parsedURL.String()

	// Check if feed already exists for this user
	existing, err := s.feedRepo.GetByURL(req.UserID, normalizedURL)
	if err != nil {
		return nil, fmt.Errorf("checking existing feed: %w", err)
	}
	if existing != nil {
		return nil, ErrFeedExists
	}

	// Create feed (title will be updated after first fetch)
	now := time.Now()
	feed := &domain.Feed{
		ID:        uuid.New(),
		UserID:    req.UserID,
		URL:       normalizedURL,
		Title:     normalizedURL, // Temporary title until fetched
		CreatedAt: now,
		UpdatedAt: now,
	}

	if err := s.feedRepo.Create(feed); err != nil {
		return nil, fmt.Errorf("creating feed: %w", err)
	}

	return &AddFeedResponse{
		ID:        feed.ID,
		URL:       feed.URL,
		Title:     feed.Title,
		CreatedAt: feed.CreatedAt,
	}, nil
}

// GetUserFeeds returns all feeds for a user.
func (s *FeedService) GetUserFeeds(userID uuid.UUID) ([]*domain.Feed, error) {
	feeds, err := s.feedRepo.GetByUserID(userID)
	if err != nil {
		return nil, fmt.Errorf("getting user feeds: %w", err)
	}
	return feeds, nil
}

// GetFeed returns a single feed by ID, verifying ownership.
func (s *FeedService) GetFeed(feedID, userID uuid.UUID) (*domain.Feed, error) {
	feed, err := s.feedRepo.GetByID(feedID)
	if err != nil {
		return nil, fmt.Errorf("getting feed: %w", err)
	}
	if feed == nil {
		return nil, ErrFeedNotFound
	}
	if feed.UserID != userID {
		return nil, ErrUnauthorized
	}
	return feed, nil
}

// DeleteFeed removes a feed subscription.
func (s *FeedService) DeleteFeed(feedID, userID uuid.UUID) error {
	feed, err := s.feedRepo.GetByID(feedID)
	if err != nil {
		return fmt.Errorf("getting feed: %w", err)
	}
	if feed == nil {
		return ErrFeedNotFound
	}
	if feed.UserID != userID {
		return ErrUnauthorized
	}

	if err := s.feedRepo.Delete(feedID); err != nil {
		return fmt.Errorf("deleting feed: %w", err)
	}

	return nil
}

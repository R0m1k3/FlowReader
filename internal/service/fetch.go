package service

import (
	"context"
	"fmt"
	"log"
	"time"

	"github.com/google/uuid"
	"github.com/michael/flowreader/internal/domain"
	"github.com/michael/flowreader/internal/parser"
	"github.com/michael/flowreader/internal/ws"
)

// FetchService handles fetching and parsing feeds.
type FetchService struct {
	feedRepo    domain.FeedRepository
	articleRepo domain.ArticleRepository
	parser      *parser.FeedParser
	hub         *ws.Hub
}

// NewFetchService creates a new fetch service.
func NewFetchService(feedRepo domain.FeedRepository, articleRepo domain.ArticleRepository, hub *ws.Hub) *FetchService {
	return &FetchService{
		feedRepo:    feedRepo,
		articleRepo: articleRepo,
		parser:      parser.NewFeedParser(),
		hub:         hub,
	}
}

// FetchFeed fetches a single feed and updates articles.
func (s *FetchService) FetchFeed(ctx context.Context, feedID uuid.UUID) error {
	feed, err := s.feedRepo.GetByID(feedID)
	if err != nil {
		return fmt.Errorf("getting feed: %w", err)
	}
	if feed == nil {
		return fmt.Errorf("feed not found: %s", feedID)
	}

	// Parse the feed
	parsedFeed, err := s.parser.Parse(ctx, feed.URL, feed.ID)
	if err != nil {
		// Update feed with error
		s.feedRepo.UpdateFetchStatus(feed.ID, time.Now(), err.Error())
		return fmt.Errorf("parsing feed: %w", err)
	}

	// Update feed metadata
	// Only update title if it's empty or looks like a URL (initial state)
	if feed.Title == "" || feed.Title == feed.URL {
		feed.Title = parsedFeed.Title
	}
	
	feed.Description = parsedFeed.Description
	feed.SiteURL = parsedFeed.SiteURL
	feed.ImageURL = parsedFeed.ImageURL
	if err := s.feedRepo.Update(feed); err != nil {
		log.Printf("Warning: failed to update feed metadata: %v", err)
	}

	// Ingest articles
	if len(parsedFeed.Articles) > 0 {
		if err := s.articleRepo.CreateBatch(parsedFeed.Articles); err != nil {
			return fmt.Errorf("ingesting articles: %w", err)
		}

		// Broadcast update
		if s.hub != nil {
			s.hub.Broadcast("new_articles", map[string]interface{}{
				"feed_id":    feed.ID,
				"feed_title": feed.Title,
				"count":      len(parsedFeed.Articles),
			})
		}
	}

	// Mark fetch as successful
	s.feedRepo.UpdateFetchStatus(feed.ID, time.Now(), "")

	return nil
}

// FetchAllPending fetches all feeds that need updating.
func (s *FetchService) FetchAllPending(ctx context.Context, concurrency int) (int, error) {
	feeds, err := s.feedRepo.GetFeedsToFetch(100)
	if err != nil {
		return 0, fmt.Errorf("getting feeds to fetch: %w", err)
	}

	if len(feeds) == 0 {
		return 0, nil
	}

	// Simple sequential fetch for now (Story 2.5 will add worker pool)
	fetchedCount := 0
	for _, feed := range feeds {
		select {
		case <-ctx.Done():
			return fetchedCount, ctx.Err()
		default:
		}

		if err := s.FetchFeed(ctx, feed.ID); err != nil {
			log.Printf("Error fetching feed %s: %v", feed.URL, err)
		} else {
			fetchedCount++
		}
	}

	return fetchedCount, nil
}

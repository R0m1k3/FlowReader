package service

import (
	"context"
	"errors"
	"fmt"
	"log"
	"math/rand/v2"
	"net"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/michael/flowreader/internal/domain"
	"github.com/michael/flowreader/internal/parser"
	"github.com/michael/flowreader/internal/ws"
)

const (
	// FetchInterval is the normal delay between two fetches of a feed.
	FetchInterval = 15 * time.Minute
	// maxBackoff caps the retry delay of a failing feed.
	maxBackoff = 24 * time.Hour
	// ArticleRetention is how long non-favorite articles are kept. Items
	// older than this are not (re-)ingested, so the cleaner can't resurrect
	// old posts as unread.
	ArticleRetention = 30 * 24 * time.Hour
	// perFeedTimeout bounds a single feed download + parse + insert.
	perFeedTimeout = 45 * time.Second
	// refreshCooldown skips feeds fetched very recently on manual refresh.
	refreshCooldown = 2 * time.Minute
)

// FetchService handles fetching and parsing feeds.
type FetchService struct {
	feedRepo    domain.FeedRepository
	articleRepo domain.ArticleRepository
	parser      *parser.FeedParser
	hub         *ws.Hub

	// sem bounds concurrent outbound fetches across the scheduler and
	// manual refreshes.
	sem chan struct{}

	mu         sync.Mutex
	refreshing map[uuid.UUID]bool
}

// NewFetchService creates a new fetch service.
func NewFetchService(feedRepo domain.FeedRepository, articleRepo domain.ArticleRepository, hub *ws.Hub, concurrency int) *FetchService {
	if concurrency <= 0 {
		concurrency = 4
	}
	return &FetchService{
		feedRepo:    feedRepo,
		articleRepo: articleRepo,
		parser:      parser.NewFeedParser(),
		hub:         hub,
		sem:         make(chan struct{}, concurrency),
		refreshing:  make(map[uuid.UUID]bool),
	}
}

// FetchFeed fetches a single feed by ID (used right after a feed is added).
func (s *FetchService) FetchFeed(ctx context.Context, feedID uuid.UUID) error {
	feed, err := s.feedRepo.GetByID(feedID)
	if err != nil {
		return fmt.Errorf("getting feed: %w", err)
	}
	if feed == nil {
		return fmt.Errorf("feed not found: %s", feedID)
	}
	s.sem <- struct{}{}
	defer func() { <-s.sem }()
	return s.fetchOne(ctx, feed)
}

// fetchOne downloads, parses and ingests one feed, then records the outcome.
func (s *FetchService) fetchOne(ctx context.Context, feed *domain.Feed) error {
	ctx, cancel := context.WithTimeout(ctx, perFeedTimeout)
	defer cancel()

	now := time.Now()
	parsed, err := s.parser.Parse(ctx, feed)
	switch {
	case errors.Is(err, parser.ErrNotModified):
		return s.saveSuccess(feed, now, nil)
	case err != nil:
		s.saveFailure(feed, now, err)
		return err
	}

	inserted, err := s.ingest(ctx, feed.ID, parsed, now)
	if err != nil {
		s.saveFailure(feed, now, err)
		return err
	}

	if err := s.saveSuccess(feed, now, parsed); err != nil {
		log.Printf("Warning: saving fetch result for %s: %v", feed.URL, err)
	}

	if inserted > 0 && s.hub != nil {
		s.hub.SendToUser(feed.UserID, "new_articles", map[string]any{
			"feed_id": feed.ID,
			"count":   inserted,
		})
	}
	return nil
}

// ingest inserts only the items not already stored, converting (sanitizing,
// image lookup) just those.
func (s *FetchService) ingest(ctx context.Context, feedID uuid.UUID, parsed *parser.ParsedFeed, now time.Time) (int, error) {
	if len(parsed.Items) == 0 {
		return 0, nil
	}
	guids := make([]string, len(parsed.Items))
	for i, it := range parsed.Items {
		guids[i] = it.GUID
	}
	existing, err := s.articleRepo.ExistingGUIDs(ctx, feedID, guids)
	if err != nil {
		return 0, err
	}

	cutoff := now.Add(-ArticleRetention)
	var fresh []*domain.Article
	for _, it := range parsed.Items {
		if _, ok := existing[it.GUID]; ok {
			continue
		}
		if p := it.PublishedAt(); p != nil && p.Before(cutoff) {
			continue
		}
		fresh = append(fresh, s.parser.ToArticle(it, feedID, now))
	}
	if len(fresh) == 0 {
		return 0, nil
	}
	n, err := s.articleRepo.InsertNew(ctx, feedID, fresh)
	if err != nil {
		return 0, fmt.Errorf("ingesting articles: %w", err)
	}
	return n, nil
}

func (s *FetchService) saveSuccess(feed *domain.Feed, now time.Time, parsed *parser.ParsedFeed) error {
	res := domain.FetchResult{
		FetchedAt:   now,
		NextFetchAt: now.Add(jitter(FetchInterval)),
	}
	if parsed != nil {
		res.ETag = parsed.ETag
		res.LastModified = parsed.LastModified
		res.Title = nonEmpty(parsed.Title)
		res.Description = nonEmpty(parsed.Description)
		res.SiteURL = nonEmpty(parsed.SiteURL)
		res.ImageURL = nonEmpty(parsed.ImageURL)
	}
	return s.feedRepo.SaveFetchResult(feed.ID, res)
}

func (s *FetchService) saveFailure(feed *domain.Feed, now time.Time, cause error) {
	count := feed.ErrorCount + 1
	backoff := FetchInterval << min(count-1, 7) // 15m, 30m, 1h … capped below
	if backoff > maxBackoff || backoff <= 0 {
		backoff = maxBackoff
	}
	log.Printf("Fetch failed for %s (attempt %d): %v", feed.URL, count, cause)
	err := s.feedRepo.SaveFetchResult(feed.ID, domain.FetchResult{
		FetchedAt:   now,
		NextFetchAt: now.Add(jitter(backoff)),
		Error:       publicFetchError(cause),
		ErrorCount:  count,
	})
	if err != nil {
		log.Printf("Warning: saving fetch failure for %s: %v", feed.URL, err)
	}
}

// publicFetchError maps an internal error to a short user-facing message,
// without leaking resolver or dial details (port/DNS scanning oracle).
func publicFetchError(err error) string {
	var netErr net.Error
	msg := err.Error()
	switch {
	case errors.Is(err, context.DeadlineExceeded) || (errors.As(err, &netErr) && netErr.Timeout()):
		return "Délai dépassé"
	case strings.Contains(msg, "unexpected status code: "):
		return "Réponse HTTP " + msg[strings.LastIndex(msg, " ")+1:]
	case strings.Contains(msg, "parsing feed"):
		return "Flux illisible (RSS/Atom invalide)"
	case strings.Contains(msg, "too large"):
		return "Flux trop volumineux"
	case strings.Contains(msg, "ingesting"):
		return "Erreur d'enregistrement"
	case strings.Contains(msg, "not allowed") || strings.Contains(msg, "private") || strings.Contains(msg, "blocked"):
		return "Adresse refusée"
	default:
		return "Serveur injoignable"
	}
}

// FetchAllPending fetches every due feed with bounded concurrency.
func (s *FetchService) FetchAllPending(ctx context.Context) (int, error) {
	feeds, err := s.feedRepo.GetFeedsToFetch(200)
	if err != nil {
		return 0, fmt.Errorf("getting feeds to fetch: %w", err)
	}
	return s.fetchMany(ctx, feeds), nil
}

func (s *FetchService) fetchMany(ctx context.Context, feeds []*domain.Feed) int {
	var (
		wg sync.WaitGroup
		mu sync.Mutex
		ok int
	)
	for _, feed := range feeds {
		select {
		case <-ctx.Done():
			wg.Wait()
			return ok
		case s.sem <- struct{}{}:
		}
		wg.Add(1)
		go func(f *domain.Feed) {
			defer wg.Done()
			defer func() { <-s.sem }()
			if err := s.fetchOne(ctx, f); err == nil {
				mu.Lock()
				ok++
				mu.Unlock()
			}
		}(feed)
	}
	wg.Wait()
	return ok
}

// RefreshUser fetches the user's feeds in the background. It returns false
// when a refresh for this user is already running (clicks are coalesced).
func (s *FetchService) RefreshUser(userID uuid.UUID) bool {
	s.mu.Lock()
	if s.refreshing[userID] {
		s.mu.Unlock()
		return false
	}
	s.refreshing[userID] = true
	s.mu.Unlock()

	go func() {
		defer func() {
			s.mu.Lock()
			delete(s.refreshing, userID)
			s.mu.Unlock()
		}()
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Minute)
		defer cancel()

		feeds, err := s.feedRepo.GetByUserID(userID)
		if err != nil {
			log.Printf("Refresh: listing feeds: %v", err)
			return
		}
		due := feeds[:0]
		for _, f := range feeds {
			if f.LastFetchedAt == nil || time.Since(*f.LastFetchedAt) > refreshCooldown {
				due = append(due, f)
			}
		}
		s.fetchMany(ctx, due)
		if s.hub != nil {
			s.hub.SendToUser(userID, "refresh_done", map[string]any{"count": len(due)})
		}
	}()
	return true
}

// jitter spreads fetches by ±10% so feeds don't all fire on the same tick.
func jitter(d time.Duration) time.Duration {
	spread := int64(d) / 10
	if spread <= 0 {
		return d
	}
	return d + time.Duration(rand.Int64N(2*spread)-spread)
}

func nonEmpty(s string) *string {
	if s == "" {
		return nil
	}
	return &s
}

package worker

import (
	"context"
	"log"
	"sync"
	"time"

	"github.com/michael/flowreader/internal/repository"
	"github.com/michael/flowreader/internal/service"
	"github.com/michael/flowreader/internal/utils"
)

// Cleaner handles periodic database maintenance.
type Cleaner struct {
	repo        *repository.ArticleRepository
	authService *service.AuthService
	interval    time.Duration
	stopCh      chan struct{}
	wg          sync.WaitGroup
}

// NewCleaner creates a new database cleaner worker.
func NewCleaner(repo *repository.ArticleRepository, authService *service.AuthService, interval time.Duration) *Cleaner {
	return &Cleaner{
		repo:        repo,
		authService: authService,
		interval:    interval,
		stopCh:      make(chan struct{}),
	}
}

// Start begins the background maintenance loop.
func (c *Cleaner) Start() {
	c.wg.Add(1)
	go c.run()
	log.Printf("Maintenance worker started (interval: %s)", c.interval)
}

// Stop gracefully stops the cleaner.
func (c *Cleaner) Stop() {
	close(c.stopCh)
	c.wg.Wait()
	log.Println("Maintenance worker stopped")
}

func (c *Cleaner) run() {
	defer c.wg.Done()

	// One-off: sanitize legacy articles and compute excerpts/word counts.
	c.backfill()

	// Initial cleanup on startup
	c.cleanup()

	ticker := time.NewTicker(c.interval)
	defer ticker.Stop()

	for {
		select {
		case <-ticker.C:
			c.cleanup()
		case <-c.stopCh:
			return
		}
	}
}

func (c *Cleaner) cleanup() {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Minute)
	defer cancel()

	count, err := c.repo.DeleteOldArticles(ctx, service.ArticleRetention)
	if err != nil {
		log.Printf("Maintenance cleanup error: %v", err)
	} else if count > 0 {
		log.Printf("Maintenance: cleaned up %d old articles", count)
	}

	if c.authService != nil {
		if n, err := c.authService.PurgeExpiredSessions(); err != nil {
			log.Printf("Maintenance session purge error: %v", err)
		} else if n > 0 {
			log.Printf("Maintenance: purged %d expired sessions", n)
		}
	}
}

// backfill processes articles stored before migration 007: their HTML is
// sanitized once and stored, and the list excerpt / word count is derived,
// so list endpoints never need to ship or sanitize full content again.
func (c *Cleaner) backfill() {
	sanitizer := utils.NewContentSanitizer()
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Minute)
	defer cancel()

	total := 0
	for {
		select {
		case <-c.stopCh:
			return
		default:
		}

		rows, err := c.repo.PendingBackfill(ctx, 200)
		if err != nil {
			log.Printf("Backfill error: %v", err)
			return
		}
		if len(rows) == 0 {
			break
		}
		for _, row := range rows {
			content := sanitizer.Sanitize(row.Content)
			summary := sanitizer.Sanitize(row.Summary)
			plain := utils.PlainText(content)
			if plain == "" {
				plain = utils.PlainText(summary)
			}
			excerptSrc := utils.PlainText(summary)
			if excerptSrc == "" {
				excerptSrc = plain
			}
			if err := c.repo.UpdateDerived(ctx, row.ID, content, summary,
				utils.Excerpt(excerptSrc, 320), utils.WordCount(plain)); err != nil {
				log.Printf("Backfill error on %s: %v", row.ID, err)
				return
			}
		}
		total += len(rows)
	}
	if total > 0 {
		log.Printf("Backfill: processed %d legacy articles", total)
	}
}

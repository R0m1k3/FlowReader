package worker

import (
	"context"
	"log"
	"sync"
	"time"

	"github.com/michael/flowreader/internal/repository"
)

// Cleaner handles periodic database maintenance.
type Cleaner struct {
	repo     *repository.ArticleRepository
	interval time.Duration
	stopCh   chan struct{}
	wg       sync.WaitGroup
}

// NewCleaner creates a new database cleaner worker.
func NewCleaner(repo *repository.ArticleRepository, interval time.Duration) *Cleaner {
	return &Cleaner{
		repo:     repo,
		interval: interval,
		stopCh:   make(chan struct{}),
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

	// Delete articles older than 30 days
	count, err := c.repo.DeleteOldArticles(ctx, 30*24*time.Hour)
	if err != nil {
		log.Printf("Maintenance cleanup error: %v", err)
		return
	}

	if count > 0 {
		log.Printf("Maintenance: cleaned up %d old articles", count)
	}
}

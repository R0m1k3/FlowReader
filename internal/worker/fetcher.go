// Package worker provides background job processing.
package worker

import (
	"context"
	"log"
	"sync"
	"time"

	"github.com/michael/flowreader/internal/service"
)

// FeedFetcher handles periodic feed fetching.
type FeedFetcher struct {
	fetchService *service.FetchService
	interval     time.Duration
	concurrency  int
	stopCh       chan struct{}
	wg           sync.WaitGroup
}

// NewFeedFetcher creates a new feed fetcher worker.
func NewFeedFetcher(fetchService *service.FetchService, interval time.Duration, concurrency int) *FeedFetcher {
	return &FeedFetcher{
		fetchService: fetchService,
		interval:     interval,
		concurrency:  concurrency,
		stopCh:       make(chan struct{}),
	}
}

// Start begins the background fetch loop.
func (f *FeedFetcher) Start() {
	f.wg.Add(1)
	go f.run()
	log.Printf("Feed fetcher started (interval: %s, concurrency: %d)", f.interval, f.concurrency)
}

// Stop gracefully stops the fetcher.
func (f *FeedFetcher) Stop() {
	close(f.stopCh)
	f.wg.Wait()
	log.Println("Feed fetcher stopped")
}

func (f *FeedFetcher) run() {
	defer f.wg.Done()

	// Initial fetch on startup
	f.fetch()

	ticker := time.NewTicker(f.interval)
	defer ticker.Stop()

	for {
		select {
		case <-ticker.C:
			f.fetch()
		case <-f.stopCh:
			return
		}
	}
}

func (f *FeedFetcher) fetch() {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Minute)
	defer cancel()

	count, err := f.fetchService.FetchAllPending(ctx, f.concurrency)
	if err != nil {
		log.Printf("Feed fetch error: %v", err)
		return
	}

	if count > 0 {
		log.Printf("Fetched %d feeds", count)
	}
}

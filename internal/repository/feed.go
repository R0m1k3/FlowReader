package repository

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/michael/flowreader/internal/domain"
)

// FeedRepository implements domain.FeedRepository using PostgreSQL.
type FeedRepository struct {
	pool *pgxpool.Pool
}

// NewFeedRepository creates a new feed repository.
func NewFeedRepository(pool *pgxpool.Pool) *FeedRepository {
	return &FeedRepository{pool: pool}
}

// Create inserts a new feed into the database.
func (r *FeedRepository) Create(feed *domain.Feed) error {
	ctx := context.Background()

	query := `
		INSERT INTO feeds (id, user_id, url, title, description, site_url, image_url, created_at, updated_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
	`

	_, err := r.pool.Exec(ctx, query,
		feed.ID,
		feed.UserID,
		feed.URL,
		feed.Title,
		feed.Description,
		feed.SiteURL,
		feed.ImageURL,
		feed.CreatedAt,
		feed.UpdatedAt,
	)

	if err != nil {
		return fmt.Errorf("creating feed: %w", err)
	}

	return nil
}

// GetByID retrieves a feed by its ID.
func (r *FeedRepository) GetByID(id uuid.UUID) (*domain.Feed, error) {
	ctx := context.Background()

	query := `
		SELECT id, user_id, url, title, description, site_url, image_url, 
		       last_fetched_at, fetch_error, created_at, updated_at
		FROM feeds
		WHERE id = $1
	`

	var feed domain.Feed
	var description, siteURL, imageURL, fetchError *string
	var lastFetchedAt *time.Time

	err := r.pool.QueryRow(ctx, query, id).Scan(
		&feed.ID,
		&feed.UserID,
		&feed.URL,
		&feed.Title,
		&description,
		&siteURL,
		&imageURL,
		&lastFetchedAt,
		&fetchError,
		&feed.CreatedAt,
		&feed.UpdatedAt,
	)

	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, nil
		}
		return nil, fmt.Errorf("getting feed by ID: %w", err)
	}

	if description != nil {
		feed.Description = *description
	}
	if siteURL != nil {
		feed.SiteURL = *siteURL
	}
	if imageURL != nil {
		feed.ImageURL = *imageURL
	}
	if fetchError != nil {
		feed.FetchError = *fetchError
	}
	feed.LastFetchedAt = lastFetchedAt

	return &feed, nil
}

// GetByUserID retrieves all feeds for a user.
func (r *FeedRepository) GetByUserID(userID uuid.UUID) ([]*domain.Feed, error) {
	ctx := context.Background()

	query := `
		SELECT f.id, f.user_id, f.url, f.title, f.description, f.site_url, f.image_url,
		       f.last_fetched_at, f.fetch_error, f.created_at, f.updated_at,
		       COALESCE((SELECT COUNT(*) FROM articles a WHERE a.feed_id = f.id AND a.is_read = false), 0) as unread_count
		FROM feeds f
		WHERE f.user_id = $1
		ORDER BY f.title ASC
	`

	rows, err := r.pool.Query(ctx, query, userID)
	if err != nil {
		return nil, fmt.Errorf("querying feeds: %w", err)
	}
	defer rows.Close()

	var feeds []*domain.Feed
	for rows.Next() {
		var feed domain.Feed
		var description, siteURL, imageURL, fetchError *string
		var lastFetchedAt *time.Time

		err := rows.Scan(
			&feed.ID,
			&feed.UserID,
			&feed.URL,
			&feed.Title,
			&description,
			&siteURL,
			&imageURL,
			&lastFetchedAt,
			&fetchError,
			&feed.CreatedAt,
			&feed.UpdatedAt,
			&feed.UnreadCount,
		)
		if err != nil {
			return nil, fmt.Errorf("scanning feed: %w", err)
		}

		if description != nil {
			feed.Description = *description
		}
		if siteURL != nil {
			feed.SiteURL = *siteURL
		}
		if imageURL != nil {
			feed.ImageURL = *imageURL
		}
		if fetchError != nil {
			feed.FetchError = *fetchError
		}
		feed.LastFetchedAt = lastFetchedAt

		feeds = append(feeds, &feed)
	}

	return feeds, nil
}

// GetByURL retrieves a feed by its URL for a specific user.
func (r *FeedRepository) GetByURL(userID uuid.UUID, url string) (*domain.Feed, error) {
	ctx := context.Background()

	query := `
		SELECT id, user_id, url, title, description, site_url, image_url,
		       last_fetched_at, fetch_error, created_at, updated_at
		FROM feeds
		WHERE user_id = $1 AND url = $2
	`

	var feed domain.Feed
	var description, siteURL, imageURL, fetchError *string
	var lastFetchedAt *time.Time

	err := r.pool.QueryRow(ctx, query, userID, url).Scan(
		&feed.ID,
		&feed.UserID,
		&feed.URL,
		&feed.Title,
		&description,
		&siteURL,
		&imageURL,
		&lastFetchedAt,
		&fetchError,
		&feed.CreatedAt,
		&feed.UpdatedAt,
	)

	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, nil
		}
		return nil, fmt.Errorf("getting feed by URL: %w", err)
	}

	if description != nil {
		feed.Description = *description
	}
	if siteURL != nil {
		feed.SiteURL = *siteURL
	}
	if imageURL != nil {
		feed.ImageURL = *imageURL
	}
	if fetchError != nil {
		feed.FetchError = *fetchError
	}
	feed.LastFetchedAt = lastFetchedAt

	return &feed, nil
}

// Update updates a feed in the database.
func (r *FeedRepository) Update(feed *domain.Feed) error {
	ctx := context.Background()

	query := `
		UPDATE feeds
		SET title = $2, description = $3, site_url = $4, image_url = $5, updated_at = $6
		WHERE id = $1
	`

	_, err := r.pool.Exec(ctx, query,
		feed.ID,
		feed.Title,
		feed.Description,
		feed.SiteURL,
		feed.ImageURL,
		time.Now(),
	)

	if err != nil {
		return fmt.Errorf("updating feed: %w", err)
	}

	return nil
}

// Delete removes a feed from the database.
func (r *FeedRepository) Delete(id uuid.UUID) error {
	ctx := context.Background()

	query := `DELETE FROM feeds WHERE id = $1`
	_, err := r.pool.Exec(ctx, query, id)
	if err != nil {
		return fmt.Errorf("deleting feed: %w", err)
	}

	return nil
}

// GetFeedsToFetch returns feeds that need to be fetched.
func (r *FeedRepository) GetFeedsToFetch(limit int) ([]*domain.Feed, error) {
	ctx := context.Background()

	query := `
		SELECT id, user_id, url, title, description, site_url, image_url,
		       last_fetched_at, fetch_error, created_at, updated_at
		FROM feeds
		WHERE last_fetched_at IS NULL 
		   OR last_fetched_at < NOW() - INTERVAL '15 minutes'
		ORDER BY last_fetched_at ASC NULLS FIRST
		LIMIT $1
	`

	rows, err := r.pool.Query(ctx, query, limit)
	if err != nil {
		return nil, fmt.Errorf("querying feeds to fetch: %w", err)
	}
	defer rows.Close()

	var feeds []*domain.Feed
	for rows.Next() {
		var feed domain.Feed
		var description, siteURL, imageURL, fetchError *string
		var lastFetchedAt *time.Time

		err := rows.Scan(
			&feed.ID,
			&feed.UserID,
			&feed.URL,
			&feed.Title,
			&description,
			&siteURL,
			&imageURL,
			&lastFetchedAt,
			&fetchError,
			&feed.CreatedAt,
			&feed.UpdatedAt,
		)
		if err != nil {
			return nil, fmt.Errorf("scanning feed: %w", err)
		}

		if description != nil {
			feed.Description = *description
		}
		if siteURL != nil {
			feed.SiteURL = *siteURL
		}
		if imageURL != nil {
			feed.ImageURL = *imageURL
		}
		if fetchError != nil {
			feed.FetchError = *fetchError
		}
		feed.LastFetchedAt = lastFetchedAt

		feeds = append(feeds, &feed)
	}

	return feeds, nil
}

// UpdateFetchStatus updates the fetch status of a feed.
func (r *FeedRepository) UpdateFetchStatus(id uuid.UUID, fetchedAt time.Time, fetchError string) error {
	ctx := context.Background()

	var query string
	var args []interface{}

	if fetchError == "" {
		query = `UPDATE feeds SET last_fetched_at = $2, fetch_error = NULL WHERE id = $1`
		args = []interface{}{id, fetchedAt}
	} else {
		query = `UPDATE feeds SET last_fetched_at = $2, fetch_error = $3 WHERE id = $1`
		args = []interface{}{id, fetchedAt, fetchError}
	}

	_, err := r.pool.Exec(ctx, query, args...)
	if err != nil {
		return fmt.Errorf("updating fetch status: %w", err)
	}

	return nil
}

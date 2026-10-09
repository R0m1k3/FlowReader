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

const feedColumns = `
	f.id, f.user_id, f.url, f.title, f.description, f.site_url, f.image_url,
	f.last_fetched_at, f.fetch_error, f.created_at, f.updated_at,
	f.etag, f.last_modified, f.error_count, f.next_fetch_at`

// scanFeed scans feedColumns (plus optional extra destinations).
func scanFeed(row pgx.Row, extra ...any) (*domain.Feed, error) {
	var feed domain.Feed
	var title, description, siteURL, imageURL, fetchError, etag, lastModified *string

	dest := []any{
		&feed.ID, &feed.UserID, &feed.URL, &title, &description, &siteURL, &imageURL,
		&feed.LastFetchedAt, &fetchError, &feed.CreatedAt, &feed.UpdatedAt,
		&etag, &lastModified, &feed.ErrorCount, &feed.NextFetchAt,
	}
	if err := row.Scan(append(dest, extra...)...); err != nil {
		return nil, err
	}
	feed.Title = deref(title)
	feed.Description = deref(description)
	feed.SiteURL = deref(siteURL)
	feed.ImageURL = deref(imageURL)
	feed.FetchError = deref(fetchError)
	feed.ETag = deref(etag)
	feed.LastModified = deref(lastModified)
	return &feed, nil
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
	query := `SELECT ` + feedColumns + ` FROM feeds f WHERE f.id = $1`

	feed, err := scanFeed(r.pool.QueryRow(context.Background(), query, id))
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, nil
		}
		return nil, fmt.Errorf("getting feed by ID: %w", err)
	}
	return feed, nil
}

// GetByUserID retrieves all feeds for a user with their unread counts.
func (r *FeedRepository) GetByUserID(userID uuid.UUID) ([]*domain.Feed, error) {
	ctx := context.Background()

	// One aggregate over the partial unread index instead of a correlated
	// COUNT(*) per feed.
	query := `
		SELECT ` + feedColumns + `, COALESCE(u.unread, 0)
		FROM feeds f
		LEFT JOIN (
			SELECT a.feed_id, COUNT(*) AS unread
			FROM articles a
			JOIN feeds uf ON uf.id = a.feed_id AND uf.user_id = $1
			WHERE NOT a.is_read
			GROUP BY a.feed_id
		) u ON u.feed_id = f.id
		WHERE f.user_id = $1
		ORDER BY lower(f.title) ASC`

	rows, err := r.pool.Query(ctx, query, userID)
	if err != nil {
		return nil, fmt.Errorf("querying feeds: %w", err)
	}
	defer rows.Close()

	feeds := make([]*domain.Feed, 0, 16)
	for rows.Next() {
		var unread int
		feed, err := scanFeed(rows, &unread)
		if err != nil {
			return nil, fmt.Errorf("scanning feed: %w", err)
		}
		feed.UnreadCount = unread
		feeds = append(feeds, feed)
	}
	return feeds, rows.Err()
}

// GetByURL retrieves a feed by its URL for a specific user.
func (r *FeedRepository) GetByURL(userID uuid.UUID, url string) (*domain.Feed, error) {
	query := `SELECT ` + feedColumns + ` FROM feeds f WHERE f.user_id = $1 AND f.url = $2`

	feed, err := scanFeed(r.pool.QueryRow(context.Background(), query, userID, url))
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, nil
		}
		return nil, fmt.Errorf("getting feed by URL: %w", err)
	}
	return feed, nil
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

// GetFeedsToFetch returns feeds whose next fetch is due, never-fetched first.
func (r *FeedRepository) GetFeedsToFetch(limit int) ([]*domain.Feed, error) {
	query := `
		SELECT ` + feedColumns + `
		FROM feeds f
		WHERE f.next_fetch_at IS NULL OR f.next_fetch_at <= NOW()
		ORDER BY f.next_fetch_at ASC NULLS FIRST
		LIMIT $1`

	rows, err := r.pool.Query(context.Background(), query, limit)
	if err != nil {
		return nil, fmt.Errorf("querying feeds to fetch: %w", err)
	}
	defer rows.Close()

	var feeds []*domain.Feed
	for rows.Next() {
		feed, err := scanFeed(rows)
		if err != nil {
			return nil, fmt.Errorf("scanning feed: %w", err)
		}
		feeds = append(feeds, feed)
	}
	return feeds, rows.Err()
}

// SaveFetchResult records the outcome of a fetch (status, schedule, HTTP
// validators and, when parsed, feed metadata) in a single statement.
// The title is only replaced while it is still the placeholder URL.
func (r *FeedRepository) SaveFetchResult(id uuid.UUID, res domain.FetchResult) error {
	const query = `
		UPDATE feeds SET
			last_fetched_at = $2,
			next_fetch_at   = $3,
			fetch_error     = NULLIF($4, ''),
			error_count     = $5,
			etag            = COALESCE(NULLIF($6, ''), etag),
			last_modified   = COALESCE(NULLIF($7, ''), last_modified),
			title       = CASE WHEN $8::text IS NOT NULL AND $8 <> '' AND (title IS NULL OR title = '' OR title = url)
			                   THEN $8 ELSE title END,
			description = COALESCE($9, description),
			site_url    = COALESCE($10, site_url),
			image_url   = COALESCE($11, image_url)
		WHERE id = $1`

	_, err := r.pool.Exec(context.Background(), query, id,
		res.FetchedAt, res.NextFetchAt, res.Error, res.ErrorCount,
		res.ETag, res.LastModified,
		res.Title, res.Description, res.SiteURL, res.ImageURL,
	)
	if err != nil {
		return fmt.Errorf("saving fetch result: %w", err)
	}
	return nil
}

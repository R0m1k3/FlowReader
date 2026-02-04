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

// ArticleRepository implements domain.ArticleRepository using PostgreSQL.
type ArticleRepository struct {
	pool *pgxpool.Pool
}

// NewArticleRepository creates a new article repository.
func NewArticleRepository(pool *pgxpool.Pool) *ArticleRepository {
	return &ArticleRepository{pool: pool}
}

// Create inserts a new article into the database.
func (r *ArticleRepository) Create(article *domain.Article) error {
	ctx := context.Background()

	query := `
		INSERT INTO articles (id, feed_id, guid, title, url, content, summary, author, image_url, published_at, created_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
		ON CONFLICT (feed_id, guid) DO NOTHING
	`

	_, err := r.pool.Exec(ctx, query,
		article.ID,
		article.FeedID,
		article.GUID,
		article.Title,
		nullString(article.URL),
		nullString(article.Content),
		nullString(article.Summary),
		nullString(article.Author),
		nullString(article.ImageURL),
		article.PublishedAt,
		article.CreatedAt,
	)

	if err != nil {
		return fmt.Errorf("creating article: %w", err)
	}

	return nil
}

// CreateBatch inserts multiple articles into the database.
func (r *ArticleRepository) CreateBatch(articles []*domain.Article) error {
	ctx := context.Background()

	batch := &pgx.Batch{}
	query := `
		INSERT INTO articles (id, feed_id, guid, title, url, content, summary, author, image_url, published_at, created_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
		ON CONFLICT (feed_id, guid) DO NOTHING
	`

	for _, article := range articles {
		batch.Queue(query,
			article.ID,
			article.FeedID,
			article.GUID,
			article.Title,
			nullString(article.URL),
			nullString(article.Content),
			nullString(article.Summary),
			nullString(article.Author),
			nullString(article.ImageURL),
			article.PublishedAt,
			article.CreatedAt,
		)
	}

	results := r.pool.SendBatch(ctx, batch)
	defer results.Close()

	for range articles {
		if _, err := results.Exec(); err != nil {
			return fmt.Errorf("batch insert: %w", err)
		}
	}

	return nil
}

// GetByID retrieves an article by its ID.
func (r *ArticleRepository) GetByID(id uuid.UUID) (*domain.Article, error) {
	ctx := context.Background()

	query := `
		SELECT a.id, a.feed_id, a.guid, a.title, a.url, a.content, a.summary, a.author, 
		       a.image_url, a.published_at, a.is_read, a.is_favorite, a.read_at, a.created_at,
		       f.title as feed_title
		FROM articles a
		JOIN feeds f ON f.id = a.feed_id
		WHERE a.id = $1
	`

	article, err := r.scanArticle(r.pool.QueryRow(ctx, query, id))
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, nil
		}
		return nil, fmt.Errorf("getting article by ID: %w", err)
	}

	return article, nil
}

// GetByFeedID retrieves articles for a specific feed.
func (r *ArticleRepository) GetByFeedID(feedID uuid.UUID, limit, offset int) ([]*domain.Article, error) {
	ctx := context.Background()

	query := `
		SELECT a.id, a.feed_id, a.guid, a.title, a.url, a.content, a.summary, a.author,
		       a.image_url, a.published_at, a.is_read, a.is_favorite, a.read_at, a.created_at,
		       f.title as feed_title
		FROM articles a
		JOIN feeds f ON f.id = a.feed_id
		WHERE a.feed_id = $1
		ORDER BY a.published_at DESC NULLS LAST, a.created_at DESC
		LIMIT $2 OFFSET $3
	`

	rows, err := r.pool.Query(ctx, query, feedID, limit, offset)
	if err != nil {
		return nil, fmt.Errorf("querying articles: %w", err)
	}
	defer rows.Close()

	return r.scanArticles(rows)
}

// GetByUserID retrieves articles for all user's feeds.
func (r *ArticleRepository) GetByUserID(userID uuid.UUID, limit, offset int, unreadOnly bool) ([]*domain.Article, error) {
	ctx := context.Background()

	var query string
	if unreadOnly {
		query = `
			SELECT a.id, a.feed_id, a.guid, a.title, a.url, a.content, a.summary, a.author,
			       a.image_url, a.published_at, a.is_read, a.is_favorite, a.read_at, a.created_at,
			       f.title as feed_title
			FROM articles a
			JOIN feeds f ON f.id = a.feed_id
			WHERE f.user_id = $1 AND a.is_read = false
			ORDER BY a.published_at DESC NULLS LAST, a.created_at DESC
			LIMIT $2 OFFSET $3
		`
	} else {
		query = `
			SELECT a.id, a.feed_id, a.guid, a.title, a.url, a.content, a.summary, a.author,
			       a.image_url, a.published_at, a.is_read, a.is_favorite, a.read_at, a.created_at,
			       f.title as feed_title
			FROM articles a
			JOIN feeds f ON f.id = a.feed_id
			WHERE f.user_id = $1
			ORDER BY a.published_at DESC NULLS LAST, a.created_at DESC
			LIMIT $2 OFFSET $3
		`
	}

	rows, err := r.pool.Query(ctx, query, userID, limit, offset)
	if err != nil {
		return nil, fmt.Errorf("querying articles: %w", err)
	}
	defer rows.Close()

	return r.scanArticles(rows)
}

// GetByGUID retrieves an article by its GUID within a feed.
func (r *ArticleRepository) GetByGUID(feedID uuid.UUID, guid string) (*domain.Article, error) {
	ctx := context.Background()

	query := `
		SELECT a.id, a.feed_id, a.guid, a.title, a.url, a.content, a.summary, a.author,
		       a.image_url, a.published_at, a.is_read, a.is_favorite, a.read_at, a.created_at,
		       f.title as feed_title
		FROM articles a
		JOIN feeds f ON f.id = a.feed_id
		WHERE a.feed_id = $1 AND a.guid = $2
	`

	article, err := r.scanArticle(r.pool.QueryRow(ctx, query, feedID, guid))
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, nil
		}
		return nil, fmt.Errorf("getting article by GUID: %w", err)
	}

	return article, nil
}

// MarkAsRead marks an article as read.
func (r *ArticleRepository) MarkAsRead(id uuid.UUID) error {
	ctx := context.Background()
	query := `UPDATE articles SET is_read = true, read_at = $2 WHERE id = $1`
	_, err := r.pool.Exec(ctx, query, id, time.Now())
	if err != nil {
		return fmt.Errorf("marking as read: %w", err)
	}
	return nil
}

// MarkAsUnread marks an article as unread.
func (r *ArticleRepository) MarkAsUnread(id uuid.UUID) error {
	ctx := context.Background()
	query := `UPDATE articles SET is_read = false, read_at = NULL WHERE id = $1`
	_, err := r.pool.Exec(ctx, query, id)
	if err != nil {
		return fmt.Errorf("marking as unread: %w", err)
	}
	return nil
}

// MarkAllAsRead marks all articles in a feed as read.
func (r *ArticleRepository) MarkAllAsRead(feedID uuid.UUID) error {
	ctx := context.Background()
	query := `UPDATE articles SET is_read = true, read_at = $2 WHERE feed_id = $1 AND is_read = false`
	_, err := r.pool.Exec(ctx, query, feedID, time.Now())
	if err != nil {
		return fmt.Errorf("marking all as read: %w", err)
	}
	return nil
}

// MarkAllAsReadGlobal marks all articles for a user as read.
func (r *ArticleRepository) MarkAllAsReadGlobal(userID uuid.UUID) error {
	ctx := context.Background()

	query := `
		UPDATE articles
		SET is_read = true, read_at = NOW()
		WHERE feed_id IN (SELECT id FROM feeds WHERE user_id = $1) AND is_read = false
	`

	_, err := r.pool.Exec(ctx, query, userID)
	if err != nil {
		return fmt.Errorf("marking all articles as read globally: %w", err)
	}

	return nil
}

// ToggleFavorite toggles the favorite status of an article.
func (r *ArticleRepository) ToggleFavorite(id uuid.UUID) error {
	ctx := context.Background()
	query := `UPDATE articles SET is_favorite = NOT is_favorite WHERE id = $1`
	_, err := r.pool.Exec(ctx, query, id)
	if err != nil {
		return fmt.Errorf("toggling favorite: %w", err)
	}
	return nil
}

// GetFavorites retrieves favorited articles for a user.
func (r *ArticleRepository) GetFavorites(userID uuid.UUID, limit, offset int) ([]*domain.Article, error) {
	ctx := context.Background()

	query := `
		SELECT a.id, a.feed_id, a.guid, a.title, a.url, a.content, a.summary, a.author,
		       a.image_url, a.published_at, a.is_read, a.is_favorite, a.read_at, a.created_at,
		       f.title as feed_title
		FROM articles a
		JOIN feeds f ON f.id = a.feed_id
		WHERE f.user_id = $1 AND a.is_favorite = true
		ORDER BY a.published_at DESC NULLS LAST, a.created_at DESC
		LIMIT $2 OFFSET $3
	`

	rows, err := r.pool.Query(ctx, query, userID, limit, offset)
	if err != nil {
		return nil, fmt.Errorf("querying favorites: %w", err)
	}
	defer rows.Close()

	return r.scanArticles(rows)
}

// CountUnread counts unread articles for a feed.
func (r *ArticleRepository) CountUnread(feedID uuid.UUID) (int, error) {
	ctx := context.Background()
	query := `SELECT COUNT(*) FROM articles WHERE feed_id = $1 AND is_read = false`

	var count int
	err := r.pool.QueryRow(ctx, query, feedID).Scan(&count)
	if err != nil {
		return 0, fmt.Errorf("counting unread: %w", err)
	}

	return count, nil
}

// scanArticle scans a single article row.
func (r *ArticleRepository) scanArticle(row pgx.Row) (*domain.Article, error) {
	var article domain.Article
	var url, content, summary, author, imageURL, feedTitle *string
	var publishedAt, readAt *time.Time

	err := row.Scan(
		&article.ID,
		&article.FeedID,
		&article.GUID,
		&article.Title,
		&url,
		&content,
		&summary,
		&author,
		&imageURL,
		&publishedAt,
		&article.IsRead,
		&article.IsFavorite,
		&readAt,
		&article.CreatedAt,
		&feedTitle,
	)

	if err != nil {
		return nil, err
	}

	if url != nil {
		article.URL = *url
	}
	if content != nil {
		article.Content = *content
	}
	if summary != nil {
		article.Summary = *summary
	}
	if author != nil {
		article.Author = *author
	}
	if imageURL != nil {
		article.ImageURL = *imageURL
	}
	if feedTitle != nil {
		article.FeedTitle = *feedTitle
	}
	article.PublishedAt = publishedAt
	article.ReadAt = readAt

	return &article, nil
}

// scanArticles scans multiple article rows.
func (r *ArticleRepository) scanArticles(rows pgx.Rows) ([]*domain.Article, error) {
	var articles []*domain.Article
	for rows.Next() {
		var article domain.Article
		var url, content, summary, author, imageURL, feedTitle *string
		var publishedAt, readAt *time.Time

		err := rows.Scan(
			&article.ID,
			&article.FeedID,
			&article.GUID,
			&article.Title,
			&url,
			&content,
			&summary,
			&author,
			&imageURL,
			&publishedAt,
			&article.IsRead,
			&article.IsFavorite,
			&readAt,
			&article.CreatedAt,
			&feedTitle,
		)

		if err != nil {
			return nil, fmt.Errorf("scanning article: %w", err)
		}

		if url != nil {
			article.URL = *url
		}
		if content != nil {
			article.Content = *content
		}
		if summary != nil {
			article.Summary = *summary
		}
		if author != nil {
			article.Author = *author
		}
		if imageURL != nil {
			article.ImageURL = *imageURL
		}
		if feedTitle != nil {
			article.FeedTitle = *feedTitle
		}
		article.PublishedAt = publishedAt
		article.ReadAt = readAt

		articles = append(articles, &article)
	}

	return articles, nil
}

// nullString returns nil if string is empty.
func nullString(s string) *string {
	if s == "" {
		return nil
	}
	return &s
}

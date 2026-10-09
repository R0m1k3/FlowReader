package repository

import (
	"context"
	"errors"
	"fmt"
	"strconv"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/michael/flowreader/internal/domain"
	"github.com/michael/flowreader/internal/utils"
)

// ArticleRepository implements domain.ArticleRepository using PostgreSQL.
type ArticleRepository struct {
	pool *pgxpool.Pool
}

// NewArticleRepository creates a new article repository.
func NewArticleRepository(pool *pgxpool.Pool) *ArticleRepository {
	return &ArticleRepository{pool: pool}
}

// listColumns are the light-weight columns sent for article lists: no full
// HTML content, only a plain-text excerpt and a word count.
const listColumns = `
	a.id, a.feed_id, a.title, a.url, a.excerpt, a.ai_summary, a.author, a.image_url,
	a.published_at, a.sort_at, a.is_read, a.is_favorite, a.read_at, a.created_at,
	a.word_count, f.title`

// ExistingGUIDs returns which of the given GUIDs are already stored for a feed.
func (r *ArticleRepository) ExistingGUIDs(ctx context.Context, feedID uuid.UUID, guids []string) (map[string]struct{}, error) {
	out := make(map[string]struct{}, len(guids))
	if len(guids) == 0 {
		return out, nil
	}
	rows, err := r.pool.Query(ctx, `SELECT guid FROM articles WHERE feed_id = $1 AND guid = ANY($2)`, feedID, guids)
	if err != nil {
		return nil, fmt.Errorf("querying existing guids: %w", err)
	}
	defer rows.Close()
	for rows.Next() {
		var g string
		if err := rows.Scan(&g); err != nil {
			return nil, fmt.Errorf("scanning guid: %w", err)
		}
		out[g] = struct{}{}
	}
	return out, rows.Err()
}

// InsertNew inserts articles, ignoring GUIDs already present, and returns
// the number of rows actually inserted.
func (r *ArticleRepository) InsertNew(ctx context.Context, feedID uuid.UUID, articles []*domain.Article) (int, error) {
	if len(articles) == 0 {
		return 0, nil
	}

	const query = `
		INSERT INTO articles (id, feed_id, guid, title, url, content, summary, excerpt, word_count,
		                      author, image_url, published_at, created_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
		ON CONFLICT (feed_id, guid) DO NOTHING`

	batch := &pgx.Batch{}
	for _, a := range articles {
		batch.Queue(query,
			a.ID, feedID, a.GUID, a.Title,
			nullString(a.URL), nullString(a.Content), nullString(a.Summary),
			a.Excerpt, a.WordCount,
			nullString(a.Author), nullString(a.ImageURL),
			a.PublishedAt, a.CreatedAt,
		)
	}

	results := r.pool.SendBatch(ctx, batch)
	defer results.Close()

	inserted := 0
	for range articles {
		tag, err := results.Exec()
		if err != nil {
			return inserted, fmt.Errorf("batch insert: %w", err)
		}
		inserted += int(tag.RowsAffected())
	}
	return inserted, nil
}

// GetForUser retrieves a full article (including content) owned by the user.
// Returns nil, nil when it doesn't exist or belongs to someone else.
func (r *ArticleRepository) GetForUser(ctx context.Context, id, userID uuid.UUID) (*domain.Article, error) {
	const query = `
		SELECT a.id, a.feed_id, a.title, a.url, a.content, a.summary, a.excerpt, a.ai_summary,
		       a.author, a.image_url, a.published_at, a.sort_at, a.is_read, a.is_favorite,
		       a.read_at, a.created_at, a.word_count, f.title
		FROM articles a
		JOIN feeds f ON f.id = a.feed_id
		WHERE a.id = $1 AND f.user_id = $2`

	var a domain.Article
	var url, content, summary, excerpt, aiSummary, author, imageURL, feedTitle *string
	var wordCount *int
	err := r.pool.QueryRow(ctx, query, id, userID).Scan(
		&a.ID, &a.FeedID, &a.Title, &url, &content, &summary, &excerpt, &aiSummary,
		&author, &imageURL, &a.PublishedAt, &a.SortAt, &a.IsRead, &a.IsFavorite,
		&a.ReadAt, &a.CreatedAt, &wordCount, &feedTitle,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, nil
		}
		return nil, fmt.Errorf("getting article: %w", err)
	}
	a.URL = deref(url)
	a.Content = deref(content)
	a.Summary = deref(summary)
	a.Excerpt = deref(excerpt)
	a.AISummary = deref(aiSummary)
	a.Author = deref(author)
	a.ImageURL = deref(imageURL)
	a.FeedTitle = deref(feedTitle)
	if wordCount != nil {
		a.WordCount = *wordCount
	} else {
		a.WordCount = utils.WordCount(utils.PlainText(firstNonEmpty(a.Content, a.Summary)))
	}
	a.ReadingTime = utils.ReadingMinutes(a.WordCount)
	return &a, nil
}

// List returns a page of the user's articles, newest first, using keyset
// pagination on (sort_at, id).
func (r *ArticleRepository) List(ctx context.Context, f domain.ArticleFilter) ([]*domain.Article, error) {
	var sb strings.Builder
	args := []any{f.UserID}
	sb.WriteString(`SELECT ` + listColumns + `
		FROM articles a
		JOIN feeds f ON f.id = a.feed_id
		WHERE f.user_id = $1`)

	if f.FeedID != nil {
		args = append(args, *f.FeedID)
		sb.WriteString(` AND a.feed_id = $` + strconv.Itoa(len(args)))
	}
	if f.UnreadOnly {
		sb.WriteString(` AND NOT a.is_read`)
	}
	if f.FavoritesOnly {
		sb.WriteString(` AND a.is_favorite`)
	}
	if f.Cursor != nil {
		args = append(args, f.Cursor.SortAt, f.Cursor.ID)
		sb.WriteString(` AND (a.sort_at, a.id) < ($` + strconv.Itoa(len(args)-1) + `, $` + strconv.Itoa(len(args)) + `)`)
	}
	args = append(args, f.Limit)
	sb.WriteString(` ORDER BY a.sort_at DESC, a.id DESC LIMIT $` + strconv.Itoa(len(args)))

	rows, err := r.pool.Query(ctx, sb.String(), args...)
	if err != nil {
		return nil, fmt.Errorf("listing articles: %w", err)
	}
	defer rows.Close()
	return scanListRows(rows, false)
}

// Search performs a full-text search on the user's articles.
func (r *ArticleRepository) Search(ctx context.Context, userID uuid.UUID, query string, limit, offset int) ([]*domain.Article, error) {
	sql := `
		SELECT ` + listColumns + `, ts_rank_cd(a.tsv, q) AS rank
		FROM articles a
		JOIN feeds f ON f.id = a.feed_id
		CROSS JOIN websearch_to_tsquery('french', $2) q
		WHERE f.user_id = $1 AND a.tsv @@ q
		ORDER BY rank DESC, a.sort_at DESC
		LIMIT $3 OFFSET $4`

	rows, err := r.pool.Query(ctx, sql, userID, query, limit, offset)
	if err != nil {
		return nil, fmt.Errorf("searching articles: %w", err)
	}
	defer rows.Close()
	return scanListRows(rows, true)
}

func scanListRows(rows pgx.Rows, withRank bool) ([]*domain.Article, error) {
	articles := make([]*domain.Article, 0, 32)
	for rows.Next() {
		var a domain.Article
		var url, excerpt, aiSummary, author, imageURL, feedTitle *string
		var wordCount *int
		var rank float32
		dest := []any{
			&a.ID, &a.FeedID, &a.Title, &url, &excerpt, &aiSummary, &author, &imageURL,
			&a.PublishedAt, &a.SortAt, &a.IsRead, &a.IsFavorite, &a.ReadAt, &a.CreatedAt,
			&wordCount, &feedTitle,
		}
		if withRank {
			dest = append(dest, &rank)
		}
		if err := rows.Scan(dest...); err != nil {
			return nil, fmt.Errorf("scanning article: %w", err)
		}
		a.URL = deref(url)
		a.Excerpt = deref(excerpt)
		a.AISummary = deref(aiSummary)
		a.Author = deref(author)
		a.ImageURL = deref(imageURL)
		a.FeedTitle = deref(feedTitle)
		if wordCount != nil {
			a.WordCount = *wordCount
		}
		a.ReadingTime = utils.ReadingMinutes(a.WordCount)
		articles = append(articles, &a)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterating articles: %w", err)
	}
	return articles, nil
}

// SetRead marks an owned article as read or unread in a single statement.
func (r *ArticleRepository) SetRead(ctx context.Context, id, userID uuid.UUID, read bool) (bool, error) {
	const query = `
		UPDATE articles a
		SET is_read = $3, read_at = CASE WHEN $3 THEN NOW() ELSE NULL END
		FROM feeds f
		WHERE a.id = $1 AND f.id = a.feed_id AND f.user_id = $2`
	tag, err := r.pool.Exec(ctx, query, id, userID, read)
	if err != nil {
		return false, fmt.Errorf("setting read state: %w", err)
	}
	return tag.RowsAffected() > 0, nil
}

// ToggleFavorite flips the favorite flag of an owned article atomically.
func (r *ArticleRepository) ToggleFavorite(ctx context.Context, id, userID uuid.UUID) (bool, bool, error) {
	const query = `
		UPDATE articles a
		SET is_favorite = NOT a.is_favorite
		FROM feeds f
		WHERE a.id = $1 AND f.id = a.feed_id AND f.user_id = $2
		RETURNING a.is_favorite`
	var fav bool
	err := r.pool.QueryRow(ctx, query, id, userID).Scan(&fav)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return false, false, nil
		}
		return false, false, fmt.Errorf("toggling favorite: %w", err)
	}
	return fav, true, nil
}

// MarkFeedRead marks every unread article of an owned feed as read.
func (r *ArticleRepository) MarkFeedRead(ctx context.Context, feedID, userID uuid.UUID) (int64, error) {
	const query = `
		UPDATE articles a SET is_read = true, read_at = NOW()
		FROM feeds f
		WHERE a.feed_id = $1 AND f.id = a.feed_id AND f.user_id = $2 AND NOT a.is_read`
	tag, err := r.pool.Exec(ctx, query, feedID, userID)
	if err != nil {
		return 0, fmt.Errorf("marking feed read: %w", err)
	}
	return tag.RowsAffected(), nil
}

// MarkAllRead marks all of a user's articles as read.
func (r *ArticleRepository) MarkAllRead(ctx context.Context, userID uuid.UUID) (int64, error) {
	const query = `
		UPDATE articles SET is_read = true, read_at = NOW()
		WHERE feed_id IN (SELECT id FROM feeds WHERE user_id = $1) AND NOT is_read`
	tag, err := r.pool.Exec(ctx, query, userID)
	if err != nil {
		return 0, fmt.Errorf("marking all articles read: %w", err)
	}
	return tag.RowsAffected(), nil
}

// UpdateAISummary updates the AI-generated summary of an article.
func (r *ArticleRepository) UpdateAISummary(ctx context.Context, id uuid.UUID, summary string) error {
	if _, err := r.pool.Exec(ctx, `UPDATE articles SET ai_summary = $2 WHERE id = $1`, id, summary); err != nil {
		return fmt.Errorf("updating AI summary: %w", err)
	}
	return nil
}

// DeleteOldArticles removes articles older than the specified duration, except for favorites.
func (r *ArticleRepository) DeleteOldArticles(ctx context.Context, olderThan time.Duration) (int64, error) {
	threshold := time.Now().Add(-olderThan)
	tag, err := r.pool.Exec(ctx, `DELETE FROM articles WHERE created_at < $1 AND NOT is_favorite`, threshold)
	if err != nil {
		return 0, fmt.Errorf("deleting old articles: %w", err)
	}
	return tag.RowsAffected(), nil
}

// BackfillRow is a legacy article that still needs sanitization and derived fields.
type BackfillRow struct {
	ID      uuid.UUID
	Content string
	Summary string
}

// PendingBackfill returns up to limit articles whose derived columns are missing.
func (r *ArticleRepository) PendingBackfill(ctx context.Context, limit int) ([]BackfillRow, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT id, content, summary FROM articles WHERE word_count IS NULL LIMIT $1`, limit)
	if err != nil {
		return nil, fmt.Errorf("querying backfill rows: %w", err)
	}
	defer rows.Close()

	var out []BackfillRow
	for rows.Next() {
		var row BackfillRow
		var content, summary *string
		if err := rows.Scan(&row.ID, &content, &summary); err != nil {
			return nil, fmt.Errorf("scanning backfill row: %w", err)
		}
		row.Content, row.Summary = deref(content), deref(summary)
		out = append(out, row)
	}
	return out, rows.Err()
}

// UpdateDerived stores sanitized content and derived list fields for one article.
func (r *ArticleRepository) UpdateDerived(ctx context.Context, id uuid.UUID, content, summary, excerpt string, words int) error {
	_, err := r.pool.Exec(ctx,
		`UPDATE articles SET content = $2, summary = $3, excerpt = $4, word_count = $5 WHERE id = $1`,
		id, nullString(content), nullString(summary), excerpt, words)
	if err != nil {
		return fmt.Errorf("updating derived fields: %w", err)
	}
	return nil
}

// nullString returns nil if string is empty.
func nullString(s string) *string {
	if s == "" {
		return nil
	}
	return &s
}

func deref(s *string) string {
	if s == nil {
		return ""
	}
	return *s
}

func firstNonEmpty(values ...string) string {
	for _, v := range values {
		if v != "" {
			return v
		}
	}
	return ""
}

DROP INDEX IF EXISTS idx_feeds_next_fetch;
ALTER TABLE feeds DROP COLUMN IF EXISTS next_fetch_at;
ALTER TABLE feeds DROP COLUMN IF EXISTS error_count;
ALTER TABLE feeds DROP COLUMN IF EXISTS last_modified;
ALTER TABLE feeds DROP COLUMN IF EXISTS etag;

CREATE INDEX IF NOT EXISTS idx_feeds_user_id ON feeds(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_articles_is_favorite ON articles(feed_id, is_favorite);
CREATE INDEX IF NOT EXISTS idx_articles_is_read ON articles(feed_id, is_read);
CREATE INDEX IF NOT EXISTS idx_articles_published_at ON articles(published_at DESC);
CREATE INDEX IF NOT EXISTS idx_articles_feed_id ON articles(feed_id);

DROP INDEX IF EXISTS idx_articles_backfill;
DROP INDEX IF EXISTS idx_articles_cleanup;
DROP INDEX IF EXISTS idx_articles_unread_feed;
DROP INDEX IF EXISTS idx_articles_fav_sort;
DROP INDEX IF EXISTS idx_articles_unread_sort;
DROP INDEX IF EXISTS idx_articles_sort;
DROP INDEX IF EXISTS idx_articles_feed_unread_sort;
DROP INDEX IF EXISTS idx_articles_feed_sort;

ALTER TABLE articles DROP COLUMN IF EXISTS sort_at;
ALTER TABLE articles DROP COLUMN IF EXISTS word_count;
ALTER TABLE articles DROP COLUMN IF EXISTS excerpt;

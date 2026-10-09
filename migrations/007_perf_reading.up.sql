-- Migration: 007_perf_reading
-- Description: list-friendly derived columns, keyset-pagination indexes,
-- conditional GET / backoff state for feeds, and removal of redundant indexes.

-- Derived article columns. Filled at ingest; legacy rows are backfilled by the
-- application at startup (word_count IS NULL marks a row as not yet processed).
ALTER TABLE articles ADD COLUMN IF NOT EXISTS excerpt TEXT;
ALTER TABLE articles ADD COLUMN IF NOT EXISTS word_count INTEGER;

-- Non-null sort key so keyset pagination works on (sort_at, id).
ALTER TABLE articles ADD COLUMN IF NOT EXISTS sort_at TIMESTAMPTZ
    GENERATED ALWAYS AS (COALESCE(published_at, created_at)) STORED;

CREATE INDEX IF NOT EXISTS idx_articles_feed_sort        ON articles (feed_id, sort_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_articles_feed_unread_sort ON articles (feed_id, sort_at DESC, id DESC) WHERE NOT is_read;
CREATE INDEX IF NOT EXISTS idx_articles_sort             ON articles (sort_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_articles_unread_sort      ON articles (sort_at DESC, id DESC) WHERE NOT is_read;
CREATE INDEX IF NOT EXISTS idx_articles_fav_sort         ON articles (sort_at DESC, id DESC) WHERE is_favorite;
CREATE INDEX IF NOT EXISTS idx_articles_unread_feed      ON articles (feed_id) WHERE NOT is_read;
CREATE INDEX IF NOT EXISTS idx_articles_cleanup          ON articles (created_at) WHERE NOT is_favorite;
CREATE INDEX IF NOT EXISTS idx_articles_backfill         ON articles (id) WHERE word_count IS NULL;

-- Redundant or unusable indexes: each one costs a write on every INSERT and
-- every is_read UPDATE.
DROP INDEX IF EXISTS idx_articles_feed_id;      -- prefix of UNIQUE(feed_id, guid)
DROP INDEX IF EXISTS idx_articles_published_at; -- wrong NULLS order, unused
DROP INDEX IF EXISTS idx_articles_is_read;      -- replaced by partial indexes
DROP INDEX IF EXISTS idx_articles_is_favorite;  -- replaced by partial index
DROP INDEX IF EXISTS idx_users_email;           -- duplicate of UNIQUE(email)
DROP INDEX IF EXISTS idx_sessions_token;        -- duplicate of UNIQUE(token)
DROP INDEX IF EXISTS idx_feeds_user_id;         -- prefix of UNIQUE(user_id, url)

-- Feed fetch state: HTTP conditional GET + exponential backoff on errors.
ALTER TABLE feeds ADD COLUMN IF NOT EXISTS etag TEXT;
ALTER TABLE feeds ADD COLUMN IF NOT EXISTS last_modified TEXT;
ALTER TABLE feeds ADD COLUMN IF NOT EXISTS error_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE feeds ADD COLUMN IF NOT EXISTS next_fetch_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_feeds_next_fetch ON feeds (next_fetch_at NULLS FIRST);

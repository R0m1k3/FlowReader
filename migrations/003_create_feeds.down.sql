-- Rollback: 003_create_feeds

DROP TRIGGER IF EXISTS update_feeds_updated_at ON feeds;
DROP TABLE IF EXISTS articles;
DROP TABLE IF EXISTS feeds;

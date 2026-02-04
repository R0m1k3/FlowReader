-- Migration: 003_create_feeds
-- Description: Create feeds and articles tables for RSS management

-- Feeds table
CREATE TABLE IF NOT EXISTS feeds (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    url VARCHAR(2048) NOT NULL,
    title VARCHAR(512),
    description TEXT,
    site_url VARCHAR(2048),
    image_url VARCHAR(2048),
    last_fetched_at TIMESTAMPTZ,
    fetch_error TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Unique constraint: one user can't add same feed twice
    UNIQUE(user_id, url)
);

-- Indexes for feeds
CREATE INDEX IF NOT EXISTS idx_feeds_user_id ON feeds(user_id);
CREATE INDEX IF NOT EXISTS idx_feeds_last_fetched ON feeds(last_fetched_at);

-- Articles table
CREATE TABLE IF NOT EXISTS articles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    feed_id UUID NOT NULL REFERENCES feeds(id) ON DELETE CASCADE,
    guid VARCHAR(2048) NOT NULL,
    title VARCHAR(1024) NOT NULL,
    url VARCHAR(2048),
    content TEXT,
    summary TEXT,
    author VARCHAR(256),
    image_url VARCHAR(2048),
    published_at TIMESTAMPTZ,
    is_read BOOLEAN NOT NULL DEFAULT FALSE,
    is_favorite BOOLEAN NOT NULL DEFAULT FALSE,
    read_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Unique constraint: one article per feed (by guid)
    UNIQUE(feed_id, guid)
);

-- Indexes for articles
CREATE INDEX IF NOT EXISTS idx_articles_feed_id ON articles(feed_id);
CREATE INDEX IF NOT EXISTS idx_articles_published_at ON articles(published_at DESC);
CREATE INDEX IF NOT EXISTS idx_articles_is_read ON articles(feed_id, is_read);
CREATE INDEX IF NOT EXISTS idx_articles_is_favorite ON articles(feed_id, is_favorite);

-- Trigger for feeds updated_at
CREATE TRIGGER update_feeds_updated_at
    BEFORE UPDATE ON feeds
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

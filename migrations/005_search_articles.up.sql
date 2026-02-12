-- Migration: 005_search_articles_up
-- Description: Add Full-Text Search support to articles table

-- Add tsvector column (generated)
-- Weighting: Title (A), Summary (B), Content (C)
ALTER TABLE articles 
ADD COLUMN IF NOT EXISTS tsv tsvector 
GENERATED ALWAYS AS (
    setweight(to_tsvector('french', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('french', coalesce(summary, '')), 'B') ||
    setweight(to_tsvector('french', coalesce(content, '')), 'C')
) STORED;

-- Create GIN index for fast searching
CREATE INDEX IF NOT EXISTS idx_articles_tsv ON articles USING GIN(tsv);

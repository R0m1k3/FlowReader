-- Migration: 005_search_articles_down
-- Description: Remove Full-Text Search support

DROP INDEX IF EXISTS idx_articles_tsv;
ALTER TABLE articles DROP COLUMN IF EXISTS tsv;

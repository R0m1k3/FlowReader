-- Migration: 006_add_ai_summary
-- Description: Add ai_summary column to articles table

ALTER TABLE articles ADD COLUMN IF NOT EXISTS ai_summary TEXT;

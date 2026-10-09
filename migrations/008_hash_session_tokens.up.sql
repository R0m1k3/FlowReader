-- Migration: 008_hash_session_tokens
-- Description: store only SHA-256(token) so a database leak can't be replayed
-- as live session cookies. Existing raw tokens (44-char base64) are hashed in
-- place, which keeps current sessions valid. Hex SHA-256 is exactly 64 chars.

UPDATE sessions
SET token = encode(sha256(convert_to(token, 'UTF8')), 'hex')
WHERE length(token) <> 64;

-- Expired sessions were never purged before; clean the backlog once.
DELETE FROM sessions WHERE expires_at < NOW();

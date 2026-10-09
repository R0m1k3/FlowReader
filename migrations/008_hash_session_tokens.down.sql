-- Hashes can't be reversed: invalidate every session instead.
DELETE FROM sessions;

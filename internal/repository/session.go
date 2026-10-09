package repository

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/michael/flowreader/internal/domain"
)

// SessionRepository implements domain.SessionRepository using PostgreSQL.
//
// Only the SHA-256 of a session token is stored, so a database leak does not
// hand out live sessions. Callers always pass the raw token.
type SessionRepository struct {
	pool *pgxpool.Pool
}

// NewSessionRepository creates a new session repository.
func NewSessionRepository(pool *pgxpool.Pool) *SessionRepository {
	return &SessionRepository{pool: pool}
}

// hashToken returns the hex SHA-256 of a raw session token.
func hashToken(token string) string {
	sum := sha256.Sum256([]byte(token))
	return hex.EncodeToString(sum[:])
}

// Create inserts a new session into the database.
func (r *SessionRepository) Create(session *domain.Session) error {
	ctx := context.Background()

	query := `
		INSERT INTO sessions (id, user_id, token, expires_at, created_at, user_agent, ip_address)
		VALUES ($1, $2, $3, $4, $5, $6, $7)
	`

	_, err := r.pool.Exec(ctx, query,
		session.ID,
		session.UserID,
		hashToken(session.Token),
		session.ExpiresAt,
		session.CreatedAt,
		session.UserAgent,
		session.IPAddress,
	)

	if err != nil {
		return fmt.Errorf("creating session: %w", err)
	}

	return nil
}

// GetByToken retrieves a non-expired session by its raw token.
func (r *SessionRepository) GetByToken(token string) (*domain.Session, error) {
	ctx := context.Background()

	query := `
		SELECT id, user_id, expires_at, created_at, user_agent, ip_address
		FROM sessions
		WHERE token = $1 AND expires_at > NOW()
	`

	var session domain.Session
	var userAgent, ipAddress *string
	err := r.pool.QueryRow(ctx, query, hashToken(token)).Scan(
		&session.ID,
		&session.UserID,
		&session.ExpiresAt,
		&session.CreatedAt,
		&userAgent,
		&ipAddress,
	)

	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, nil // Session not found or expired
		}
		return nil, fmt.Errorf("getting session by token: %w", err)
	}

	session.Token = token
	session.UserAgent = deref(userAgent)
	session.IPAddress = deref(ipAddress)

	return &session, nil
}

// GetUserByToken resolves a raw session token to its user in one round trip.
// Returns nil, nil when the session is unknown or expired.
func (r *SessionRepository) GetUserByToken(ctx context.Context, token string) (*domain.User, error) {
	const query = `
		SELECT u.id, u.email, u.created_at, u.role
		FROM sessions s
		JOIN users u ON u.id = s.user_id
		WHERE s.token = $1 AND s.expires_at > NOW()`

	var u domain.User
	err := r.pool.QueryRow(ctx, query, hashToken(token)).Scan(&u.ID, &u.Email, &u.CreatedAt, &u.Role)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, nil
		}
		return nil, fmt.Errorf("resolving session: %w", err)
	}
	u.IsAdmin = u.Role == domain.RoleAdmin
	return &u, nil
}

// Delete removes a session by its raw token.
func (r *SessionRepository) Delete(token string) error {
	ctx := context.Background()

	query := `DELETE FROM sessions WHERE token = $1`
	_, err := r.pool.Exec(ctx, query, hashToken(token))
	if err != nil {
		return fmt.Errorf("deleting session: %w", err)
	}

	return nil
}

// DeleteByUserID removes all sessions for a user.
func (r *SessionRepository) DeleteByUserID(userID uuid.UUID) error {
	ctx := context.Background()

	query := `DELETE FROM sessions WHERE user_id = $1`
	_, err := r.pool.Exec(ctx, query, userID)
	if err != nil {
		return fmt.Errorf("deleting user sessions: %w", err)
	}

	return nil
}

// DeleteExpired removes all expired sessions.
func (r *SessionRepository) DeleteExpired() (int64, error) {
	ctx := context.Background()

	query := `DELETE FROM sessions WHERE expires_at < NOW()`
	result, err := r.pool.Exec(ctx, query)
	if err != nil {
		return 0, fmt.Errorf("deleting expired sessions: %w", err)
	}

	return result.RowsAffected(), nil
}

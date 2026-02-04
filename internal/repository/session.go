package repository

import (
	"context"
	"errors"
	"fmt"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/michael/flowreader/internal/domain"
)

// SessionRepository implements domain.SessionRepository using PostgreSQL.
type SessionRepository struct {
	pool *pgxpool.Pool
}

// NewSessionRepository creates a new session repository.
func NewSessionRepository(pool *pgxpool.Pool) *SessionRepository {
	return &SessionRepository{pool: pool}
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
		session.Token,
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

// GetByToken retrieves a session by its token.
func (r *SessionRepository) GetByToken(token string) (*domain.Session, error) {
	ctx := context.Background()

	query := `
		SELECT id, user_id, token, expires_at, created_at, user_agent, ip_address
		FROM sessions
		WHERE token = $1 AND expires_at > NOW()
	`

	var session domain.Session
	var userAgent, ipAddress *string
	err := r.pool.QueryRow(ctx, query, token).Scan(
		&session.ID,
		&session.UserID,
		&session.Token,
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

	if userAgent != nil {
		session.UserAgent = *userAgent
	}
	if ipAddress != nil {
		session.IPAddress = *ipAddress
	}

	return &session, nil
}

// Delete removes a session by its token.
func (r *SessionRepository) Delete(token string) error {
	ctx := context.Background()

	query := `DELETE FROM sessions WHERE token = $1`
	_, err := r.pool.Exec(ctx, query, token)
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

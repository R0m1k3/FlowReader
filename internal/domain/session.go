package domain

import (
	"time"

	"github.com/google/uuid"
)

// Session represents an active user session.
type Session struct {
	ID        uuid.UUID `json:"id"`
	UserID    uuid.UUID `json:"user_id"`
	Token     string    `json:"-"` // Never expose in JSON
	ExpiresAt time.Time `json:"expires_at"`
	CreatedAt time.Time `json:"created_at"`
	UserAgent string    `json:"user_agent,omitempty"`
	IPAddress string    `json:"ip_address,omitempty"`
}

// SessionRepository defines the interface for session data access.
type SessionRepository interface {
	Create(session *Session) error
	GetByToken(token string) (*Session, error)
	Delete(token string) error
	DeleteByUserID(userID uuid.UUID) error
	DeleteExpired() (int64, error)
}

// Package service contains business logic services.
package service

import (
	"context"
	"crypto/rand"
	"crypto/subtle"
	"encoding/base64"
	"errors"
	"fmt"
	"os"
	"regexp"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/michael/flowreader/internal/domain"
	"golang.org/x/crypto/argon2"
)

// Common errors
var (
	ErrInvalidEmail       = errors.New("invalid email format")
	ErrPasswordTooShort   = errors.New("password must be at least 8 characters")
	ErrEmailAlreadyExists = errors.New("email already registered")
	ErrUserNotFound       = errors.New("user not found")
	ErrInvalidCredentials = errors.New("invalid credentials")
	ErrPasswordTooLong    = errors.New("password too long")
	ErrRegistrationClosed = errors.New("registration disabled")
)

// Argon2id parameters: OWASP minimum (m=19 MiB, t=2, p=1). Lighter on memory
// than the previous 64 MiB so a small container survives concurrent logins.
// Existing hashes keep verifying: parameters are read from the stored hash.
const (
	argon2Time      = 2
	argon2Memory    = 19 * 1024 // 19 MiB
	argon2Threads   = 1
	argon2KeyLen    = 32
	maxPasswordLen  = 256
	saltLength      = 16
	tokenLength     = 32
	sessionDuration = 7 * 24 * time.Hour // 7 days
)

// hashSem bounds concurrent Argon2 computations so a burst of logins can't
// exhaust memory.
var hashSem = make(chan struct{}, 1)

var emailRegex = regexp.MustCompile(`^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$`)

// dummyHash is verified against when the user doesn't exist so login timing
// doesn't reveal which emails have accounts.
var dummyHash, _ = hashPassword("flowreader-timing-equaliser")

// RegistrationEnabled reports whether new accounts may be created. The first
// account (admin bootstrap) is always allowed. Set REGISTRATION_ENABLED=false
// to close sign-ups on a public instance.
func RegistrationEnabled() bool {
	switch strings.ToLower(os.Getenv("REGISTRATION_ENABLED")) {
	case "false", "0", "no":
		return false
	}
	return true
}

// AuthService handles user authentication business logic.
type AuthService struct {
	userRepo    domain.UserRepository
	sessionRepo domain.SessionRepository
}

// NewAuthService creates a new authentication service.
func NewAuthService(userRepo domain.UserRepository, sessionRepo domain.SessionRepository) *AuthService {
	return &AuthService{
		userRepo:    userRepo,
		sessionRepo: sessionRepo,
	}
}

// RegisterRequest contains the data needed to register a new user.
type RegisterRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

// RegisterResponse contains the registered user data.
type RegisterResponse struct {
	ID        uuid.UUID `json:"id"`
	Email     string    `json:"email"`
	CreatedAt time.Time `json:"created_at"`
}

// LoginRequest contains the data needed to log in.
type LoginRequest struct {
	Email     string `json:"email"`
	Password  string `json:"password"`
	UserAgent string `json:"-"`
	IPAddress string `json:"-"`
}

// LoginResponse contains the session result. The token itself is intentionally
// NOT serialized to JSON: it is delivered only via the HttpOnly session cookie
// so it remains inaccessible to client-side scripts.
type LoginResponse struct {
	Token     string    `json:"-"`
	ExpiresAt time.Time `json:"expires_at"`
	User      UserInfo  `json:"user"`
}

// UserInfo contains basic user information.
type UserInfo struct {
	ID      uuid.UUID `json:"id"`
	Email   string    `json:"email"`
	IsAdmin bool      `json:"is_admin"`
}

// Register creates a new user account.
func (s *AuthService) Register(req RegisterRequest) (*RegisterResponse, error) {
	req.Email = strings.ToLower(strings.TrimSpace(req.Email))

	if !RegistrationEnabled() {
		users, err := s.userRepo.List()
		if err != nil {
			return nil, fmt.Errorf("checking registration: %w", err)
		}
		if len(users) > 0 {
			return nil, ErrRegistrationClosed
		}
	}

	// Validate email format
	if !isValidEmail(req.Email) {
		return nil, ErrInvalidEmail
	}

	// Validate password length
	if len(req.Password) < 8 {
		return nil, ErrPasswordTooShort
	}
	if len(req.Password) > maxPasswordLen {
		return nil, ErrPasswordTooLong
	}

	// Check if email already exists
	exists, err := s.userRepo.Exists(req.Email)
	if err != nil {
		return nil, fmt.Errorf("checking email: %w", err)
	}
	if exists {
		return nil, ErrEmailAlreadyExists
	}

	// Hash password with Argon2id
	passwordHash, err := hashPassword(req.Password)
	if err != nil {
		return nil, fmt.Errorf("hashing password: %w", err)
	}

	// Create user
	now := time.Now()
	user := &domain.User{
		ID:           uuid.New(),
		Email:        req.Email,
		PasswordHash: passwordHash,
		IsAdmin:      false,
		CreatedAt:    now,
		UpdatedAt:    now,
	}

	if err := s.userRepo.Create(user); err != nil {
		return nil, fmt.Errorf("creating user: %w", err)
	}

	return &RegisterResponse{
		ID:        user.ID,
		Email:     user.Email,
		CreatedAt: user.CreatedAt,
	}, nil
}

// Login authenticates a user and creates a session.
func (s *AuthService) Login(req LoginRequest) (*LoginResponse, error) {
	if len(req.Password) > maxPasswordLen {
		return nil, ErrInvalidCredentials
	}

	// Find user by email
	user, err := s.userRepo.GetByEmail(strings.TrimSpace(req.Email))
	if err != nil {
		return nil, fmt.Errorf("finding user: %w", err)
	}
	if user == nil {
		// Burn the same CPU as a real check to avoid user enumeration by timing.
		verifyPassword(req.Password, dummyHash)
		return nil, ErrInvalidCredentials
	}

	// Verify password
	if !verifyPassword(req.Password, user.PasswordHash) {
		return nil, ErrInvalidCredentials
	}

	// Generate session token
	token, err := generateToken()
	if err != nil {
		return nil, fmt.Errorf("generating token: %w", err)
	}

	// Create session
	now := time.Now()
	session := &domain.Session{
		ID:        uuid.New(),
		UserID:    user.ID,
		Token:     token,
		ExpiresAt: now.Add(sessionDuration),
		CreatedAt: now,
		UserAgent: req.UserAgent,
		IPAddress: req.IPAddress,
	}

	if err := s.sessionRepo.Create(session); err != nil {
		return nil, fmt.Errorf("creating session: %w", err)
	}

	return &LoginResponse{
		Token:     token,
		ExpiresAt: session.ExpiresAt,
		User: UserInfo{
			ID:      user.ID,
			Email:   user.Email,
			IsAdmin: user.IsAdmin,
		},
	}, nil
}

// Logout invalidates a session.
func (s *AuthService) Logout(token string) error {
	return s.sessionRepo.Delete(token)
}

// GetUserByToken retrieves the user associated with a session token in a
// single query. Returns nil, nil for an unknown or expired session.
func (s *AuthService) GetUserByToken(token string) (*domain.User, error) {
	return s.GetUserByTokenCtx(context.Background(), token)
}

// GetUserByTokenCtx is GetUserByToken bound to a request context.
func (s *AuthService) GetUserByTokenCtx(ctx context.Context, token string) (*domain.User, error) {
	if token == "" {
		return nil, nil
	}
	user, err := s.sessionRepo.GetUserByToken(ctx, token)
	if err != nil {
		return nil, fmt.Errorf("resolving session: %w", err)
	}
	return user, nil
}

// PurgeExpiredSessions deletes expired sessions.
func (s *AuthService) PurgeExpiredSessions() (int64, error) {
	return s.sessionRepo.DeleteExpired()
}

// hashPassword creates an Argon2id hash of the password.
func hashPassword(password string) (string, error) {
	salt := make([]byte, saltLength)
	if _, err := rand.Read(salt); err != nil {
		return "", err
	}

	hashSem <- struct{}{}
	hash := argon2.IDKey([]byte(password), salt, argon2Time, argon2Memory, argon2Threads, argon2KeyLen)
	<-hashSem

	// Encode salt and hash together
	encoded := fmt.Sprintf("$argon2id$v=%d$m=%d,t=%d,p=%d$%s$%s",
		argon2.Version,
		argon2Memory,
		argon2Time,
		argon2Threads,
		base64.RawStdEncoding.EncodeToString(salt),
		base64.RawStdEncoding.EncodeToString(hash),
	)

	return encoded, nil
}

// verifyPassword checks if the password matches the hash.
func verifyPassword(password, encodedHash string) bool {
	// Parse the encoded hash
	parts := strings.Split(encodedHash, "$")
	if len(parts) != 6 {
		return false
	}

	var memory, time uint32
	var threads uint8
	_, err := fmt.Sscanf(parts[3], "m=%d,t=%d,p=%d", &memory, &time, &threads)
	if err != nil {
		return false
	}

	salt, err := base64.RawStdEncoding.DecodeString(parts[4])
	if err != nil {
		return false
	}

	expectedHash, err := base64.RawStdEncoding.DecodeString(parts[5])
	if err != nil {
		return false
	}

	// Refuse absurd parameters from a tampered hash (memory in KiB).
	if memory > 128*1024 || time > 10 || threads == 0 || threads > 8 {
		return false
	}

	// Compute hash with same parameters
	hashSem <- struct{}{}
	computedHash := argon2.IDKey([]byte(password), salt, time, memory, threads, uint32(len(expectedHash)))
	<-hashSem

	// Constant-time comparison
	return subtle.ConstantTimeCompare(expectedHash, computedHash) == 1
}

// generateToken creates a cryptographically secure random token.
func generateToken() (string, error) {
	bytes := make([]byte, tokenLength)
	if _, err := rand.Read(bytes); err != nil {
		return "", err
	}
	return base64.URLEncoding.EncodeToString(bytes), nil
}

// isValidEmail checks if the email has a valid format.
func isValidEmail(email string) bool {
	return len(email) <= 254 && emailRegex.MatchString(email)
}

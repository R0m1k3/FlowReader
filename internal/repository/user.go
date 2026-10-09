// Package repository implements data access for domain entities.
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

// UserRepository implements domain.UserRepository using PostgreSQL.
type UserRepository struct {
	pool *pgxpool.Pool
}

// NewUserRepository creates a new user repository.
func NewUserRepository(pool *pgxpool.Pool) *UserRepository {
	return &UserRepository{pool: pool}
}

// Create inserts a new user into the database. The very first account becomes
// admin; the decision is made atomically under an advisory lock so two
// concurrent first registrations can't both be promoted.
func (r *UserRepository) Create(user *domain.User) error {
	ctx := context.Background()

	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("starting transaction: %w", err)
	}
	defer tx.Rollback(ctx)

	// Arbitrary constant key serialising user creation.
	if _, err := tx.Exec(ctx, `SELECT pg_advisory_xact_lock(7314001)`); err != nil {
		return fmt.Errorf("locking user creation: %w", err)
	}

	role := user.Role
	if role == "" {
		role = domain.RoleUser
	}

	const query = `
		INSERT INTO users (id, email, password_hash, created_at, role)
		VALUES ($1, $2, $3, $4,
		        CASE WHEN NOT EXISTS (SELECT 1 FROM users) THEN 'admin' ELSE $5 END)
		RETURNING role`

	if err := tx.QueryRow(ctx, query,
		user.ID, user.Email, user.PasswordHash, user.CreatedAt, role,
	).Scan(&user.Role); err != nil {
		return fmt.Errorf("creating user: %w", err)
	}
	user.IsAdmin = user.Role == domain.RoleAdmin

	return tx.Commit(ctx)
}

// GetByEmail retrieves a user by their email address (case-insensitive).
func (r *UserRepository) GetByEmail(email string) (*domain.User, error) {
	return r.getOne(`
		SELECT id, email, password_hash, created_at, role
		FROM users
		WHERE lower(email) = lower($1)`, email)
}

// GetByID retrieves a user by their ID.
func (r *UserRepository) GetByID(id uuid.UUID) (*domain.User, error) {
	return r.getOne(`
		SELECT id, email, password_hash, created_at, role
		FROM users
		WHERE id = $1`, id)
}

func (r *UserRepository) getOne(query string, arg any) (*domain.User, error) {
	var user domain.User
	err := r.pool.QueryRow(context.Background(), query, arg).Scan(
		&user.ID,
		&user.Email,
		&user.PasswordHash,
		&user.CreatedAt,
		&user.Role,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, nil // User not found
		}
		return nil, fmt.Errorf("getting user: %w", err)
	}
	user.IsAdmin = user.Role == domain.RoleAdmin
	return &user, nil
}

// List retrieves all users.
func (r *UserRepository) List() ([]*domain.User, error) {
	ctx := context.Background()
	query := `SELECT id, email, created_at, role FROM users ORDER BY created_at ASC`

	rows, err := r.pool.Query(ctx, query)
	if err != nil {
		return nil, fmt.Errorf("listing users: %w", err)
	}
	defer rows.Close()

	var users []*domain.User
	for rows.Next() {
		var u domain.User
		if err := rows.Scan(&u.ID, &u.Email, &u.CreatedAt, &u.Role); err != nil {
			return nil, fmt.Errorf("scanning user: %w", err)
		}
		u.IsAdmin = u.Role == domain.RoleAdmin
		users = append(users, &u)
	}

	return users, rows.Err()
}

// Delete removes a user and their data (cascaded by DB).
func (r *UserRepository) Delete(id uuid.UUID) error {
	ctx := context.Background()
	_, err := r.pool.Exec(ctx, "DELETE FROM users WHERE id = $1", id)
	if err != nil {
		return fmt.Errorf("deleting user: %w", err)
	}
	return nil
}

// Exists checks if an email already exists (case-insensitive).
func (r *UserRepository) Exists(email string) (bool, error) {
	ctx := context.Background()

	query := `SELECT EXISTS(SELECT 1 FROM users WHERE lower(email) = lower($1))`

	var exists bool
	err := r.pool.QueryRow(ctx, query, email).Scan(&exists)
	if err != nil {
		return false, fmt.Errorf("checking user exists: %w", err)
	}

	return exists, nil
}

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

// Create inserts a new user into the database.
func (r *UserRepository) Create(user *domain.User) error {
	ctx := context.Background()

	// Check if this is the first user
	var count int
	err := r.pool.QueryRow(ctx, "SELECT COUNT(*) FROM users").Scan(&count)
	if err != nil {
		return fmt.Errorf("counting users: %w", err)
	}

	if count == 0 {
		user.Role = domain.RoleAdmin
	} else if user.Role == "" {
		user.Role = domain.RoleUser
	}

	query := `
		INSERT INTO users (id, email, password_hash, created_at, role)
		VALUES ($1, $2, $3, $4, $5)
	`

	_, err = r.pool.Exec(ctx, query,
		user.ID,
		user.Email,
		user.PasswordHash,
		user.CreatedAt,
		user.Role,
	)

	if err != nil {
		return fmt.Errorf("creating user: %w", err)
	}

	return nil
}

// GetByEmail retrieves a user by their email address.
func (r *UserRepository) GetByEmail(email string) (*domain.User, error) {
	ctx := context.Background()

	query := `
		SELECT id, email, password_hash, created_at, role
		FROM users
		WHERE email = $1
	`

	var user domain.User
	err := r.pool.QueryRow(ctx, query, email).Scan(
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
		return nil, fmt.Errorf("getting user by email: %w", err)
	}

	return &user, nil
}

// GetByID retrieves a user by their ID.
func (r *UserRepository) GetByID(id uuid.UUID) (*domain.User, error) {
	ctx := context.Background()

	query := `
		SELECT id, email, password_hash, created_at, role
		FROM users
		WHERE id = $1
	`

	var user domain.User
	err := r.pool.QueryRow(ctx, query, id).Scan(
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
		return nil, fmt.Errorf("getting user by ID: %w", err)
	}

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
		users = append(users, &u)
	}

	return users, nil
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

// Exists checks if an email already exists.
func (r *UserRepository) Exists(email string) (bool, error) {
	ctx := context.Background()

	query := `SELECT EXISTS(SELECT 1 FROM users WHERE email = $1)`

	var exists bool
	err := r.pool.QueryRow(ctx, query, email).Scan(&exists)
	if err != nil {
		return false, fmt.Errorf("checking user exists: %w", err)
	}

	return exists, nil
}

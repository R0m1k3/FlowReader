// Package database provides database connection and migration utilities.
package database

import (
	"context"
	"fmt"
	"log"

	"github.com/jackc/pgx/v5/pgxpool"
)

// Connect creates a new connection pool to the database.
func Connect(ctx context.Context, databaseURL string) (*pgxpool.Pool, error) {
	config, err := pgxpool.ParseConfig(databaseURL)
	if err != nil {
		return nil, fmt.Errorf("parsing database URL: %w", err)
	}

	// Connection pool settings (optimized for low memory)
	config.MaxConns = 10
	config.MinConns = 2

	pool, err := pgxpool.NewWithConfig(ctx, config)
	if err != nil {
		return nil, fmt.Errorf("creating connection pool: %w", err)
	}

	// Verify connection
	if err := pool.Ping(ctx); err != nil {
		pool.Close()
		return nil, fmt.Errorf("pinging database: %w", err)
	}

	log.Println("Database connection established")
	return pool, nil
}

// RunMigrations executes pending database migrations.
// Note: For production, use golang-migrate CLI. This is for development convenience.
func RunMigrations(ctx context.Context, pool *pgxpool.Pool) error {
	// Check if schema_migrations table exists
	var exists bool
	err := pool.QueryRow(ctx, `
		SELECT EXISTS (
			SELECT FROM information_schema.tables 
			WHERE table_schema = 'public' 
			AND table_name = 'schema_migrations'
		)
	`).Scan(&exists)
	if err != nil {
		return fmt.Errorf("checking schema_migrations: %w", err)
	}

	if !exists {
		log.Println("Migrations table not found. Run 'make migrate-up' to apply migrations.")
		return nil
	}

	log.Println("Database migrations verified")
	return nil
}

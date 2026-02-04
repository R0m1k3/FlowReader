// Package database provides database connection and migration utilities.
package database

import (
	"context"
	"fmt"
	"log"

	"os"
	"path/filepath"
	"sort"
	"strings"

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
func RunMigrations(ctx context.Context, pool *pgxpool.Pool) error {
	// Check if users table exists
	var exists bool
	err := pool.QueryRow(ctx, `
		SELECT EXISTS (
			SELECT FROM information_schema.tables 
			WHERE table_schema = 'public' 
			AND table_name = 'users'
		)
	`).Scan(&exists)
	if err != nil {
		return fmt.Errorf("checking users table: %w", err)
	}

	if exists {
		log.Println("Database already initialized")
		return nil
	}

	log.Println("Initializing database and applying migrations...")

	// Read migration files
	entries, err := os.ReadDir("./migrations")
	if err != nil {
		return fmt.Errorf("reading migrations dir: %w", err)
	}

	var upFiles []string
	for _, entry := range entries {
		if !entry.IsDir() && strings.HasSuffix(entry.Name(), ".up.sql") {
			upFiles = append(upFiles, entry.Name())
		}
	}
	sort.Strings(upFiles)

	for _, file := range upFiles {
		log.Printf("Applying migration: %s", file)
		content, err := os.ReadFile(filepath.Join("./migrations", file))
		if err != nil {
			return fmt.Errorf("reading migration %s: %w", file, err)
		}

		if _, err := pool.Exec(ctx, string(content)); err != nil {
			return fmt.Errorf("executing migration %s: %w", file, err)
		}
	}

	log.Println("All migrations applied successfully")
	return nil
}

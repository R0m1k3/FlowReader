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
	// 1. Create schema_migrations table if it doesn't exist
	_, err := pool.Exec(ctx, `
		CREATE TABLE IF NOT EXISTS schema_migrations (
			version VARCHAR(255) PRIMARY KEY,
			applied_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
		)
	`)
	if err != nil {
		return fmt.Errorf("creating schema_migrations table: %w", err)
	}

	// 2. Get applied migrations
	rows, err := pool.Query(ctx, "SELECT version FROM schema_migrations")
	if err != nil {
		return fmt.Errorf("querying applied migrations: %w", err)
	}
	defer rows.Close()

	applied := make(map[string]bool)
	for rows.Next() {
		var version string
		if err := rows.Scan(&version); err != nil {
			return fmt.Errorf("scanning migration version: %w", err)
		}
		applied[version] = true
	}

	// 3. Special case for legacy system:
	// If 'users' table exists but 'schema_migrations' is empty,
	// mark all migrations up to 005 as applied to avoid duplicate creation errors.
	if len(applied) == 0 {
		var usersExists bool
		pool.QueryRow(ctx, "SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'users')").Scan(&usersExists)
		if usersExists {
			log.Println("Legacy database detected, bootstrapping migration tracking...")
			// We assume 001 to 005 are already there if users table exists in the old system
			legacyVersions := []string{"001_create_users.up.sql", "002_create_sessions.up.sql", "003_create_feeds.up.sql", "004_add_user_roles.up.sql", "005_search_articles.up.sql"}
			for _, v := range legacyVersions {
				_, err := pool.Exec(ctx, "INSERT INTO schema_migrations (version) VALUES ($1)", v)
				if err != nil {
					log.Printf("Warning: failed to bootstrap version %s: %v", v, err)
				}
				applied[v] = true
			}
		}
	}

	// 4. Read migration files
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

	// 5. Apply pending migrations
	for _, file := range upFiles {
		if applied[file] {
			continue
		}

		log.Printf("Applying migration: %s", file)
		content, err := os.ReadFile(filepath.Join("./migrations", file))
		if err != nil {
			return fmt.Errorf("reading migration %s: %w", file, err)
		}

		// Execute in transaction
		tx, err := pool.Begin(ctx)
		if err != nil {
			return fmt.Errorf("starting transaction for %s: %w", file, err)
		}
		defer tx.Rollback(ctx)

		if _, err := tx.Exec(ctx, string(content)); err != nil {
			return fmt.Errorf("executing migration %s: %w", file, err)
		}

		if _, err := tx.Exec(ctx, "INSERT INTO schema_migrations (version) VALUES ($1)", file); err != nil {
			return fmt.Errorf("recording migration %s: %w", file, err)
		}

		if err := tx.Commit(ctx); err != nil {
			return fmt.Errorf("committing migration %s: %w", file, err)
		}
	}

	log.Println("Database schema is up to date")
	return nil
}

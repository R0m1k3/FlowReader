//! Connection pool and SQL migrations.
//!
//! Migrations are plain `NNN_name.up.sql` files applied in order and tracked
//! in `schema_migrations` — the same table and naming the previous (Go)
//! server used, so an existing database is picked up as is.

use std::collections::HashSet;
use std::path::Path;
use std::time::Duration;

use anyhow::Context;
use sqlx::postgres::{PgPool, PgPoolOptions};

pub async fn connect(url: &str) -> anyhow::Result<PgPool> {
    let pool = PgPoolOptions::new()
        // Small pool: the database container is tuned for 20 connections.
        .max_connections(10)
        .min_connections(2)
        .acquire_timeout(Duration::from_secs(10))
        .idle_timeout(Duration::from_secs(300))
        .connect(url)
        .await
        .context("connecting to the database")?;
    tracing::info!("database connection established");
    Ok(pool)
}

const LEGACY_VERSIONS: [&str; 5] = [
    "001_create_users.up.sql",
    "002_create_sessions.up.sql",
    "003_create_feeds.up.sql",
    "004_add_user_roles.up.sql",
    "005_search_articles.up.sql",
];

pub async fn migrate(pool: &PgPool, dir: &Path) -> anyhow::Result<()> {
    sqlx::raw_sql(
        "CREATE TABLE IF NOT EXISTS schema_migrations (
            version VARCHAR(255) PRIMARY KEY,
            applied_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        )",
    )
    .execute(pool)
    .await
    .context("creating schema_migrations")?;

    let mut applied: HashSet<String> =
        sqlx::query_scalar::<_, String>("SELECT version FROM schema_migrations")
            .fetch_all(pool)
            .await
            .context("reading applied migrations")?
            .into_iter()
            .collect();

    // Very old installs created the schema without tracking: if `users`
    // exists but nothing is recorded, assume 001–005 are in place.
    if applied.is_empty() {
        let users_exists: bool = sqlx::query_scalar(
            "SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'users')",
        )
        .fetch_one(pool)
        .await?;
        if users_exists {
            tracing::info!("legacy database detected, bootstrapping migration tracking");
            for v in LEGACY_VERSIONS {
                sqlx::query(
                    "INSERT INTO schema_migrations (version) VALUES ($1) ON CONFLICT DO NOTHING",
                )
                .bind(v)
                .execute(pool)
                .await?;
                applied.insert(v.to_string());
            }
        }
    }

    let mut files: Vec<String> = std::fs::read_dir(dir)
        .with_context(|| format!("reading {}", dir.display()))?
        .filter_map(|e| e.ok())
        .filter(|e| e.file_type().map(|t| t.is_file()).unwrap_or(false))
        .filter_map(|e| e.file_name().into_string().ok())
        .filter(|n| n.ends_with(".up.sql"))
        .collect();
    files.sort();

    for file in files {
        if applied.contains(&file) {
            continue;
        }
        tracing::info!(migration = %file, "applying migration");
        let sql = std::fs::read_to_string(dir.join(&file))
            .with_context(|| format!("reading migration {file}"))?;
        let mut tx = pool.begin().await?;
        sqlx::raw_sql(&sql)
            .execute(&mut *tx)
            .await
            .with_context(|| format!("executing migration {file}"))?;
        sqlx::query("INSERT INTO schema_migrations (version) VALUES ($1)")
            .bind(&file)
            .execute(&mut *tx)
            .await?;
        tx.commit().await?;
    }
    tracing::info!("database schema is up to date");
    Ok(())
}

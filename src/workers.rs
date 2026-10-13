//! Background jobs: feed scheduler and daily maintenance.

use std::sync::Arc;
use std::time::Duration;

use chrono::Utc;
use sqlx::PgPool;

use crate::fetch::{FetchService, ARTICLE_RETENTION};
use crate::{repo, sanitize, text};

/// Each feed carries its own next_fetch_at; due feeds are looked for every minute.
pub fn spawn_fetcher(fetcher: Arc<FetchService>) {
    tokio::spawn(async move {
        tracing::info!("feed fetcher started (interval: 1m)");
        let mut tick = tokio::time::interval(Duration::from_secs(60));
        tick.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Delay);
        loop {
            tick.tick().await;
            match tokio::time::timeout(Duration::from_secs(300), fetcher.fetch_all_due()).await {
                Ok(Ok(n)) if n > 0 => tracing::info!("fetched {n} feeds"),
                Ok(Ok(_)) => {}
                Ok(Err(e)) => tracing::warn!("feed fetch error: {e}"),
                Err(_) => tracing::warn!("feed fetch round timed out"),
            }
        }
    });
}

pub fn spawn_maintenance(pool: PgPool, limiters: Vec<Arc<dyn Fn() + Send + Sync>>) {
    tokio::spawn(async move {
        tracing::info!("maintenance worker started (interval: 24h)");
        backfill(&pool).await;
        let mut tick = tokio::time::interval(Duration::from_secs(24 * 3600));
        loop {
            tick.tick().await;
            cleanup(&pool).await;
        }
    });
    tokio::spawn(async move {
        let mut tick = tokio::time::interval(Duration::from_secs(600));
        loop {
            tick.tick().await;
            for f in &limiters {
                f();
            }
        }
    });
}

async fn cleanup(pool: &PgPool) {
    match repo::delete_old_articles(pool, Utc::now() - ARTICLE_RETENTION).await {
        Ok(n) if n > 0 => tracing::info!("maintenance: cleaned up {n} old articles"),
        Ok(_) => {}
        Err(e) => tracing::warn!("maintenance cleanup error: {e}"),
    }
    match repo::delete_expired_sessions(pool).await {
        Ok(n) if n > 0 => tracing::info!("maintenance: purged {n} expired sessions"),
        Ok(_) => {}
        Err(e) => tracing::warn!("maintenance session purge error: {e}"),
    }
    match repo::clamp_future_dates(pool).await {
        Ok(n) if n > 0 => tracing::info!("maintenance: fixed {n} future publication dates"),
        Ok(_) => {}
        Err(e) => tracing::warn!("maintenance date fix error: {e}"),
    }
}

/// Sanitizes legacy articles once and derives their excerpt / word count, so
/// list endpoints never need to ship or sanitize full content.
async fn backfill(pool: &PgPool) {
    let mut total = 0;
    loop {
        let rows = match repo::pending_backfill(pool, 200).await {
            Ok(r) => r,
            Err(e) => {
                tracing::warn!("backfill error: {e}");
                return;
            }
        };
        if rows.is_empty() {
            break;
        }
        let n = rows.len();
        let derived = tokio::task::spawn_blocking(move || {
            rows.into_iter()
                .map(|row| {
                    let content = sanitize::sanitize(&row.content);
                    let summary = sanitize::sanitize(&row.summary);
                    let mut plain = text::plain_text(&content);
                    if plain.is_empty() {
                        plain = text::plain_text(&summary);
                    }
                    let mut excerpt_src = text::plain_text(&summary);
                    if excerpt_src.is_empty() {
                        excerpt_src = plain.clone();
                    }
                    (
                        row.id,
                        content,
                        summary,
                        text::excerpt(&excerpt_src, 320),
                        text::word_count(&plain),
                    )
                })
                .collect::<Vec<_>>()
        })
        .await
        .unwrap_or_default();
        if derived.is_empty() {
            return;
        }
        for (id, content, summary, excerpt, words) in derived {
            if let Err(e) =
                repo::update_derived(pool, id, &content, &summary, &excerpt, words).await
            {
                tracing::warn!("backfill error on {id}: {e}");
                return;
            }
        }
        total += n;
    }
    if total > 0 {
        tracing::info!("backfill: processed {total} legacy articles");
    }
}

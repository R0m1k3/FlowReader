//! Feed fetching: scheduling, conditional GET, error backoff and ingest.

use std::collections::HashSet;
use std::sync::{Arc, Mutex};
use std::time::Duration;

use chrono::{DateTime, Utc};
use rand::Rng;
use serde_json::json;
use sqlx::PgPool;
use tokio::sync::Semaphore;
use tokio::task::JoinSet;
use uuid::Uuid;

use crate::hub::Hub;
use crate::models::{Feed, FetchResult};
use crate::parser::{self, FeedParser, FetchError, ParsedFeed};
use crate::repo;

/// Normal delay between two fetches of a feed.
pub const FETCH_INTERVAL: Duration = Duration::from_secs(15 * 60);
/// Cap of the retry delay of a failing feed.
const MAX_BACKOFF: Duration = Duration::from_secs(24 * 3600);
/// How long non-favorite articles are kept. Older items are not
/// (re-)ingested, so the cleaner can't resurrect old posts as unread.
pub const ARTICLE_RETENTION: chrono::Duration = chrono::Duration::days(30);
/// Bound of a single feed download + parse + insert.
const PER_FEED_TIMEOUT: Duration = Duration::from_secs(45);
/// Manual refresh skips feeds fetched this recently.
const REFRESH_COOLDOWN: chrono::Duration = chrono::Duration::minutes(2);

pub struct FetchService {
    pool: PgPool,
    parser: FeedParser,
    hub: Arc<Hub>,
    /// Bounds concurrent outbound fetches across the scheduler and manual
    /// refreshes, so they don't starve the API's database pool.
    sem: Arc<Semaphore>,
    refreshing: Mutex<HashSet<Uuid>>,
}

impl FetchService {
    pub fn new(pool: PgPool, hub: Arc<Hub>, concurrency: usize) -> Arc<Self> {
        Arc::new(Self {
            pool,
            parser: FeedParser::new(),
            hub,
            sem: Arc::new(Semaphore::new(concurrency.max(1))),
            refreshing: Mutex::new(HashSet::new()),
        })
    }

    /// Fetches a single feed (used right after a feed is added).
    pub async fn fetch_feed(self: &Arc<Self>, feed_id: Uuid) {
        let Ok(Some(feed)) = repo::feed_by_id(&self.pool, feed_id).await else {
            return;
        };
        let Ok(_permit) = self.sem.acquire().await else {
            return;
        };
        self.fetch_one(&feed).await;
    }

    /// Downloads, parses and ingests one feed, then records the outcome.
    /// Returns true on success.
    async fn fetch_one(&self, feed: &Feed) -> bool {
        let now = Utc::now();
        let outcome = tokio::time::timeout(PER_FEED_TIMEOUT, async {
            let parsed = self.parser.fetch(feed).await?;
            let inserted = self.ingest(feed.id, &parsed, now).await?;
            Ok::<_, FetchError>((parsed, inserted))
        })
        .await
        .unwrap_or(Err(FetchError::Timeout));

        match outcome {
            Ok((parsed, inserted)) => {
                self.save_success(feed, now, Some(&parsed)).await;
                if inserted > 0 {
                    self.hub.send_to_user(
                        feed.user_id,
                        "new_articles",
                        json!({ "feed_id": feed.id, "count": inserted }),
                    );
                }
                true
            }
            Err(FetchError::NotModified) => {
                self.save_success(feed, now, None).await;
                true
            }
            Err(err) => {
                self.save_failure(feed, now, &err).await;
                false
            }
        }
    }

    /// Inserts only the items not already stored, converting (sanitizing,
    /// image lookup) just those.
    async fn ingest(
        &self,
        feed_id: Uuid,
        parsed: &ParsedFeed,
        now: DateTime<Utc>,
    ) -> Result<u64, FetchError> {
        if parsed.items.is_empty() {
            return Ok(0);
        }
        let guids: Vec<String> = parsed.items.iter().map(|i| i.guid.clone()).collect();
        let existing: HashSet<String> = repo::existing_guids(&self.pool, feed_id, &guids)
            .await
            .map_err(|e| {
                tracing::warn!("existing guids: {e}");
                FetchError::Network
            })?
            .into_iter()
            .collect();

        let cutoff = now - ARTICLE_RETENTION;
        let fresh: Vec<_> = parsed
            .items
            .iter()
            .filter(|it| !existing.contains(&it.guid))
            .filter(|it| it.published_at().is_none_or(|p| p >= cutoff))
            .map(|it| parser::to_article(it, now))
            .collect();
        if fresh.is_empty() {
            return Ok(0);
        }
        repo::insert_articles(&self.pool, feed_id, &fresh)
            .await
            .map_err(|e| {
                tracing::warn!("ingesting articles: {e}");
                FetchError::Network
            })
    }

    async fn save_success(&self, feed: &Feed, now: DateTime<Utc>, parsed: Option<&ParsedFeed>) {
        let mut res = FetchResult {
            fetched_at: now,
            next_fetch_at: now + jitter(FETCH_INTERVAL),
            ..Default::default()
        };
        if let Some(p) = parsed {
            res.etag = p.etag.clone();
            res.last_modified = p.last_modified.clone();
            res.title = non_empty(&p.title);
            res.description = non_empty(&p.description);
            res.site_url = non_empty(&p.site_url);
            res.image_url = non_empty(&p.image_url);
        }
        if let Err(e) = repo::save_fetch_result(&self.pool, feed.id, &res).await {
            tracing::warn!(url = %feed.url, "saving fetch result: {e}");
        }
    }

    async fn save_failure(&self, feed: &Feed, now: DateTime<Utc>, cause: &FetchError) {
        let count = feed.error_count.saturating_add(1);
        // 15m, 30m, 1h … capped at 24h.
        let backoff = FETCH_INTERVAL
            .checked_mul(1u32 << (count - 1).clamp(0, 7))
            .unwrap_or(MAX_BACKOFF)
            .min(MAX_BACKOFF);
        tracing::info!(url = %feed.url, attempt = count, "fetch failed: {cause}");
        let res = FetchResult {
            fetched_at: now,
            next_fetch_at: now + jitter(backoff),
            error: cause.public(),
            error_count: count,
            ..Default::default()
        };
        if let Err(e) = repo::save_fetch_result(&self.pool, feed.id, &res).await {
            tracing::warn!(url = %feed.url, "saving fetch failure: {e}");
        }
    }

    /// Fetches every due feed with bounded concurrency.
    pub async fn fetch_all_due(self: &Arc<Self>) -> anyhow::Result<usize> {
        let feeds = repo::feeds_due(&self.pool, 200).await?;
        Ok(self.fetch_many(feeds).await)
    }

    async fn fetch_many(self: &Arc<Self>, feeds: Vec<Feed>) -> usize {
        let mut set = JoinSet::new();
        for feed in feeds {
            let Ok(permit) = self.sem.clone().acquire_owned().await else {
                break;
            };
            let this = self.clone();
            set.spawn(async move {
                let ok = this.fetch_one(&feed).await;
                drop(permit);
                ok
            });
        }
        let mut ok = 0;
        while let Some(r) = set.join_next().await {
            if r.unwrap_or(false) {
                ok += 1;
            }
        }
        ok
    }

    /// Fetches the user's feeds in the background. Returns false when a
    /// refresh for this user is already running (clicks are coalesced).
    pub fn refresh_user(self: &Arc<Self>, user_id: Uuid) -> bool {
        if !self.refreshing.lock().unwrap().insert(user_id) {
            return false;
        }
        let this = self.clone();
        tokio::spawn(async move {
            let run = async {
                let feeds = match repo::feeds_for_user(&this.pool, user_id).await {
                    Ok(f) => f,
                    Err(e) => {
                        tracing::warn!("refresh: listing feeds: {e}");
                        return;
                    }
                };
                let now = Utc::now();
                let due: Vec<Feed> = feeds
                    .into_iter()
                    .filter(|f| f.last_fetched_at.is_none_or(|t| now - t > REFRESH_COOLDOWN))
                    .collect();
                let count = due.len();
                this.fetch_many(due).await;
                this.hub
                    .send_to_user(user_id, "refresh_done", json!({ "count": count }));
            };
            let _ = tokio::time::timeout(Duration::from_secs(300), run).await;
            this.refreshing.lock().unwrap().remove(&user_id);
        });
        true
    }
}

/// Spreads fetches by ±10% so feeds don't all fire on the same tick.
fn jitter(d: Duration) -> chrono::Duration {
    let spread = d.as_secs_f64() / 10.0;
    let secs = d.as_secs_f64() + rand::thread_rng().gen_range(-spread..spread);
    chrono::Duration::milliseconds((secs * 1000.0) as i64)
}

fn non_empty(s: &str) -> Option<String> {
    (!s.is_empty()).then(|| s.to_string())
}

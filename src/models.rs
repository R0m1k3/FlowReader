//! Domain types, serialized exactly as the web client expects.

use chrono::{DateTime, Utc};
use serde::Serialize;
use uuid::Uuid;

pub const ROLE_ADMIN: &str = "admin";

fn is_empty(s: &str) -> bool {
    s.is_empty()
}

#[derive(Debug, Clone, Serialize, sqlx::FromRow)]
pub struct User {
    pub id: Uuid,
    pub email: String,
    #[serde(skip)]
    #[sqlx(default)]
    pub password_hash: String,
    #[sqlx(skip)]
    pub is_admin: bool,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub role: String,
}

impl User {
    pub fn with_admin_flag(mut self) -> Self {
        self.is_admin = self.role == ROLE_ADMIN;
        self
    }
}

#[derive(Debug, Clone, Serialize, sqlx::FromRow)]
pub struct Feed {
    pub id: Uuid,
    pub user_id: Uuid,
    pub url: String,
    pub title: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub site_url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub image_url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_fetched_at: Option<DateTime<Utc>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub fetch_error: Option<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,

    // Fetch state (HTTP conditional GET + error backoff); not exposed.
    #[serde(skip)]
    pub etag: Option<String>,
    #[serde(skip)]
    pub last_modified: Option<String>,
    #[serde(skip)]
    pub error_count: i32,

    #[sqlx(default)]
    pub unread_count: i64,
}

impl Feed {
    /// Empty strings are stored as NULL and never sent to the client.
    pub fn normalize(mut self) -> Self {
        for f in [
            &mut self.description,
            &mut self.site_url,
            &mut self.image_url,
            &mut self.fetch_error,
        ] {
            if f.as_deref() == Some("") {
                *f = None;
            }
        }
        self
    }
}

#[derive(Debug, Clone, Serialize, sqlx::FromRow)]
pub struct Article {
    pub id: Uuid,
    pub feed_id: Uuid,
    pub title: String,
    #[serde(skip_serializing_if = "is_empty")]
    pub url: String,
    #[serde(skip_serializing_if = "is_empty")]
    #[sqlx(default)]
    pub content: String,
    #[serde(skip_serializing_if = "is_empty")]
    #[sqlx(default)]
    pub summary: String,
    #[serde(skip_serializing_if = "is_empty")]
    pub excerpt: String,
    #[serde(skip_serializing_if = "is_empty")]
    pub ai_summary: String,
    #[serde(skip_serializing_if = "is_empty")]
    pub author: String,
    #[serde(skip_serializing_if = "is_empty")]
    pub image_url: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub published_at: Option<DateTime<Utc>>,
    pub sort_at: DateTime<Utc>,
    pub is_read: bool,
    pub is_favorite: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub read_at: Option<DateTime<Utc>>,
    pub created_at: DateTime<Utc>,
    pub word_count: i32,
    #[sqlx(skip)]
    pub reading_time: i32,
    #[serde(skip_serializing_if = "is_empty")]
    pub feed_title: String,
}

/// An article built from a feed item, ready to insert.
#[derive(Debug, Clone)]
pub struct NewArticle {
    pub id: Uuid,
    pub guid: String,
    pub title: String,
    pub url: Option<String>,
    pub content: Option<String>,
    pub summary: Option<String>,
    pub excerpt: String,
    pub word_count: i32,
    pub author: Option<String>,
    pub image_url: Option<String>,
    pub published_at: Option<DateTime<Utc>>,
    pub created_at: DateTime<Utc>,
}

/// Keyset pagination position: the (sort_at, id) of the last article of the
/// previous page.
#[derive(Debug, Clone, Copy)]
pub struct ArticleCursor {
    pub sort_at: DateTime<Utc>,
    pub id: Uuid,
}

/// Selects a page of a user's articles, newest first.
#[derive(Debug, Default, Clone)]
pub struct ArticleFilter {
    pub user_id: Uuid,
    pub feed_id: Option<Uuid>,
    pub unread_only: bool,
    pub favorites_only: bool,
    pub cursor: Option<ArticleCursor>,
    pub limit: i64,
}

/// Outcome of one fetch attempt, persisted in one statement.
#[derive(Debug, Default)]
pub struct FetchResult {
    pub fetched_at: DateTime<Utc>,
    pub next_fetch_at: DateTime<Utc>,
    pub error: String,
    pub error_count: i32,
    pub etag: String,
    pub last_modified: String,
    pub title: Option<String>,
    pub description: Option<String>,
    pub site_url: Option<String>,
    pub image_url: Option<String>,
}

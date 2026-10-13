//! JSON API handlers (same routes and payloads as the previous server).

// Early-return responses are the error type of the small helpers below.
#![allow(clippy::result_large_err)]

use std::time::Duration;

use axum::body::Bytes;
use axum::extract::ws::{Message, WebSocket, WebSocketUpgrade};
use axum::extract::{Multipart, Path, Query, State as AxState};
use axum::http::header::{self, HeaderMap, HeaderValue};
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use axum::{Extension, Json};
use chrono::{DateTime, Utc};
use futures_util::{SinkExt, StreamExt};
use serde::de::DeserializeOwned;
use serde::Deserialize;
use serde_json::{json, Value};
use uuid::Uuid;

use super::middleware::{self as mw, SESSION_COOKIE};
use super::State;
use crate::models::{ArticleCursor, ArticleFilter, User};
use crate::{auth, opml, repo, sanitize, text};

const SESSION_DAYS: i64 = 7;
const MAX_OPML_FEEDS: usize = 500;

pub fn error(status: StatusCode, message: &str) -> Response {
    (status, Json(json!({ "error": message }))).into_response()
}

fn internal(context: &str, err: impl std::fmt::Display, message: &str) -> Response {
    tracing::error!("{context}: {err}");
    error(StatusCode::INTERNAL_SERVER_ERROR, message)
}

fn ok(value: impl serde::Serialize) -> Response {
    Json(value).into_response()
}

/// Lenient JSON body: any content type, unknown fields ignored.
fn parse_body<T: DeserializeOwned>(body: &Bytes) -> Result<T, Response> {
    serde_json::from_slice(body).map_err(|_| error(StatusCode::BAD_REQUEST, "Invalid request body"))
}

fn parse_id(raw: &str, what: &str) -> Result<Uuid, Response> {
    Uuid::parse_str(raw).map_err(|_| error(StatusCode::BAD_REQUEST, &format!("Invalid {what} ID")))
}

pub async fn index() -> Response {
    ok(json!({ "message": "FlowReader API v1" }))
}

pub async fn not_found() -> Response {
    error(StatusCode::NOT_FOUND, "Not found")
}

pub async fn health(AxState(state): AxState<State>) -> Response {
    match sqlx::query("SELECT 1").execute(&state.pool).await {
        Ok(_) => ok(json!({ "status": "ok", "service": "flowreader" })),
        Err(_) => (
            StatusCode::SERVICE_UNAVAILABLE,
            "Database connection failed",
        )
            .into_response(),
    }
}

// ----------------------------------------------------------------- auth ---

#[derive(Deserialize, Default)]
#[serde(default)]
pub struct Credentials {
    email: String,
    password: String,
}

pub async fn register(AxState(state): AxState<State>, body: Bytes) -> Response {
    let req: Credentials = match parse_body(&body) {
        Ok(r) => r,
        Err(e) => return e,
    };
    let email = req.email.trim().to_lowercase();

    if !state.config.registration_enabled {
        match repo::count_users(&state.pool).await {
            Ok(0) => {}
            Ok(_) => {
                return error(
                    StatusCode::FORBIDDEN,
                    "Registration is disabled on this instance",
                )
            }
            Err(e) => return internal("checking registration", e, "Registration failed"),
        }
    }
    if !auth::is_valid_email(&email) {
        return error(StatusCode::BAD_REQUEST, "Invalid email format");
    }
    if req.password.len() < 8 {
        return error(
            StatusCode::BAD_REQUEST,
            "Password must be at least 8 characters",
        );
    }
    if req.password.len() > auth::MAX_PASSWORD_LEN {
        return error(StatusCode::BAD_REQUEST, "Password is too long");
    }
    match repo::user_exists(&state.pool, &email).await {
        Ok(true) => return error(StatusCode::CONFLICT, "Email already registered"),
        Ok(false) => {}
        Err(e) => return internal("checking email", e, "Registration failed"),
    }
    let hash = match auth::hash_password(req.password).await {
        Ok(h) => h,
        Err(e) => return internal("hashing password", e, "Registration failed"),
    };
    let id = Uuid::new_v4();
    let now = Utc::now();
    if let Err(e) = repo::create_user(&state.pool, id, &email, &hash, now).await {
        if let sqlx::Error::Database(db) = &e {
            if db.is_unique_violation() {
                return error(StatusCode::CONFLICT, "Email already registered");
            }
        }
        return internal("creating user", e, "Registration failed");
    }
    (
        StatusCode::CREATED,
        Json(json!({ "id": id, "email": email, "created_at": now })),
    )
        .into_response()
}

fn session_cookie(value: &str, expires: Option<DateTime<Utc>>, secure: bool) -> HeaderValue {
    let mut c = format!("{SESSION_COOKIE}={value}; Path=/; HttpOnly; SameSite=Strict");
    match expires {
        Some(t) => c.push_str(&format!(
            "; Expires={}",
            t.format("%a, %d %b %Y %H:%M:%S GMT")
        )),
        None => c.push_str("; Max-Age=0"),
    }
    if secure {
        c.push_str("; Secure");
    }
    HeaderValue::from_str(&c).expect("valid cookie header")
}

pub async fn login(AxState(state): AxState<State>, req: axum::extract::Request) -> Response {
    let ip = mw::client_ip(&state, req.extensions(), req.headers());
    let headers = req.headers().clone();
    let body = match axum::body::to_bytes(req.into_body(), 1 << 20).await {
        Ok(b) => b,
        Err(_) => return error(StatusCode::BAD_REQUEST, "Invalid request body"),
    };
    let creds: Credentials = match parse_body(&body) {
        Ok(r) => r,
        Err(e) => return e,
    };
    let invalid = || error(StatusCode::UNAUTHORIZED, "Invalid email or password");
    if creds.password.len() > auth::MAX_PASSWORD_LEN {
        return invalid();
    }
    let user = match repo::user_by_email(&state.pool, creds.email.trim()).await {
        Ok(u) => u,
        Err(e) => return internal("finding user", e, "Login failed"),
    };
    let hash = user.as_ref().map(|u| u.password_hash.clone());
    if !auth::verify_password(creds.password, hash).await {
        return invalid();
    }
    let user = user.expect("verified user exists");

    let token = auth::generate_token();
    let expires_at = Utc::now() + chrono::Duration::days(SESSION_DAYS);
    let ua = headers
        .get(header::USER_AGENT)
        .and_then(|v| v.to_str().ok())
        .unwrap_or("");
    if let Err(e) = repo::create_session(&state.pool, user.id, &token, expires_at, ua, &ip).await {
        return internal("creating session", e, "Login failed");
    }

    let mut resp = ok(json!({
        "expires_at": expires_at,
        "user": { "id": user.id, "email": user.email, "is_admin": user.is_admin },
    }));
    let secure = mw::secure_cookie(&state, &headers);
    resp.headers_mut().insert(
        header::SET_COOKIE,
        session_cookie(&token, Some(expires_at), secure),
    );
    resp
}

pub async fn logout(AxState(state): AxState<State>, headers: HeaderMap) -> Response {
    let Some(token) = mw::cookie(&headers, SESSION_COOKIE) else {
        return ok(json!({ "message": "Already logged out" }));
    };
    if let Err(e) = repo::delete_session(&state.pool, &token).await {
        tracing::warn!("deleting session: {e}");
    }
    let mut resp = ok(json!({ "message": "Logged out successfully" }));
    let secure = mw::secure_cookie(&state, &headers);
    resp.headers_mut()
        .insert(header::SET_COOKIE, session_cookie("", None, secure));
    resp
}

pub async fn me(Extension(user): Extension<User>) -> Response {
    ok(json!({ "id": user.id, "email": user.email, "is_admin": user.is_admin }))
}

// ---------------------------------------------------------------- admin ---

pub async fn list_users(AxState(state): AxState<State>) -> Response {
    match repo::list_users(&state.pool).await {
        Ok(users) => ok(users),
        Err(e) => internal("listing users", e, "Failed to list users"),
    }
}

pub async fn delete_user(
    AxState(state): AxState<State>,
    Extension(me): Extension<User>,
    Path(id): Path<String>,
) -> Response {
    let id = match parse_id(&id, "user") {
        Ok(id) => id,
        Err(e) => return e,
    };
    // An admin can't delete their own account (lockout / accidental removal).
    if id == me.id {
        return error(StatusCode::FORBIDDEN, "You cannot delete your own account");
    }
    match repo::delete_user(&state.pool, id).await {
        Ok(()) => ok(json!({ "message": "User deleted successfully" })),
        Err(e) => internal("deleting user", e, "Failed to delete user"),
    }
}

// ---------------------------------------------------------------- feeds ---

/// Accepts only absolute http(s) URLs.
fn valid_feed_url(raw: &str) -> Option<String> {
    let raw = raw.trim();
    if raw.len() > 2048 {
        return None;
    }
    let u = url::Url::parse(raw).ok()?;
    ((u.scheme() == "http" || u.scheme() == "https") && u.host_str().is_some_and(|h| !h.is_empty()))
        .then(|| raw.to_string())
}

pub async fn list_feeds(
    AxState(state): AxState<State>,
    Extension(user): Extension<User>,
) -> Response {
    match repo::feeds_for_user(&state.pool, user.id).await {
        Ok(feeds) => ok(feeds),
        Err(e) => internal("listing feeds", e, "Failed to get feeds"),
    }
}

#[derive(Deserialize, Default)]
#[serde(default)]
pub struct AddFeed {
    url: String,
}

pub async fn add_feed(
    AxState(state): AxState<State>,
    Extension(user): Extension<User>,
    body: Bytes,
) -> Response {
    let req: AddFeed = match parse_body(&body) {
        Ok(r) => r,
        Err(e) => return e,
    };
    let Some(url) = valid_feed_url(&req.url) else {
        return error(StatusCode::BAD_REQUEST, "Invalid URL format");
    };
    match repo::feed_exists(&state.pool, user.id, &url).await {
        Ok(true) => return error(StatusCode::CONFLICT, "Feed already exists"),
        Ok(false) => {}
        Err(e) => return internal("checking feed", e, "Failed to add feed"),
    }
    // The URL is a placeholder title until the first fetch.
    let feed = match repo::create_feed(&state.pool, Uuid::new_v4(), user.id, &url, &url, None).await
    {
        Ok(f) => f,
        Err(sqlx::Error::Database(db)) if db.is_unique_violation() => {
            return error(StatusCode::CONFLICT, "Feed already exists")
        }
        Err(e) => return internal("creating feed", e, "Failed to add feed"),
    };

    let fetcher = state.fetcher.clone();
    let feed_id = feed.id;
    tokio::spawn(async move {
        let _ = tokio::time::timeout(Duration::from_secs(60), fetcher.fetch_feed(feed_id)).await;
    });

    (
        StatusCode::CREATED,
        Json(json!({ "id": feed.id, "url": feed.url, "title": feed.title, "created_at": feed.created_at })),
    )
        .into_response()
}

pub async fn refresh_feeds(
    AxState(state): AxState<State>,
    Extension(user): Extension<User>,
) -> Response {
    // Runs in the background through the shared worker pool; concurrent
    // clicks are coalesced and recently fetched feeds skipped.
    let message = if state.fetcher.refresh_user(user.id) {
        "Refresh started"
    } else {
        "Refresh already running"
    };
    (StatusCode::ACCEPTED, Json(json!({ "message": message }))).into_response()
}

/// Loads a feed and checks ownership.
async fn owned_feed(
    state: &State,
    user: &User,
    raw_id: &str,
    action: &str,
) -> Result<crate::models::Feed, Response> {
    let id = parse_id(raw_id, "feed")?;
    match repo::feed_by_id(&state.pool, id).await {
        Ok(None) => Err(error(StatusCode::NOT_FOUND, "Feed not found")),
        Ok(Some(f)) if f.user_id != user.id => Err(error(StatusCode::FORBIDDEN, "Access denied")),
        Ok(Some(f)) => Ok(f),
        Err(e) => Err(internal(
            "getting feed",
            e,
            &format!("Failed to {action} feed"),
        )),
    }
}

pub async fn get_feed(
    AxState(state): AxState<State>,
    Extension(user): Extension<User>,
    Path(id): Path<String>,
) -> Response {
    match owned_feed(&state, &user, &id, "get").await {
        Ok(f) => ok(f),
        Err(e) => e,
    }
}

pub async fn delete_feed(
    AxState(state): AxState<State>,
    Extension(user): Extension<User>,
    Path(id): Path<String>,
) -> Response {
    let feed = match owned_feed(&state, &user, &id, "delete").await {
        Ok(f) => f,
        Err(e) => return e,
    };
    match repo::delete_feed(&state.pool, feed.id).await {
        Ok(()) => ok(json!({ "message": "Feed deleted" })),
        Err(e) => internal("deleting feed", e, "Failed to delete feed"),
    }
}

#[derive(Deserialize, Default)]
#[serde(default)]
pub struct UpdateFeed {
    title: String,
}

pub async fn update_feed(
    AxState(state): AxState<State>,
    Extension(user): Extension<User>,
    Path(id): Path<String>,
    body: Bytes,
) -> Response {
    let id_check = parse_id(&id, "feed");
    if let Err(e) = id_check {
        return e;
    }
    let req: UpdateFeed = match parse_body(&body) {
        Ok(r) => r,
        Err(e) => return e,
    };
    if req.title.is_empty() {
        return error(StatusCode::BAD_REQUEST, "Title is required");
    }
    let title = text::truncate_chars(req.title.trim(), 512).to_string();
    let mut feed = match owned_feed(&state, &user, &id, "update").await {
        Ok(f) => f,
        Err(e) => return e,
    };
    if let Err(e) = repo::rename_feed(&state.pool, feed.id, &title).await {
        return internal("updating feed", e, "Failed to update feed");
    }
    feed.title = title;
    feed.updated_at = Utc::now();
    ok(feed)
}

pub async fn import_opml(
    AxState(state): AxState<State>,
    Extension(user): Extension<User>,
    mut form: Multipart,
) -> Response {
    let mut data = None;
    loop {
        match form.next_field().await {
            Ok(Some(field)) if field.name() == Some("file") => match field.bytes().await {
                Ok(b) => {
                    data = Some(b);
                    break;
                }
                Err(_) => return error(StatusCode::BAD_REQUEST, "Invalid form data"),
            },
            Ok(Some(_)) => continue,
            Ok(None) => break,
            Err(_) => return error(StatusCode::BAD_REQUEST, "Invalid form data"),
        }
    }
    let Some(data) = data else {
        return error(StatusCode::BAD_REQUEST, "No file provided");
    };
    let Ok(feeds) = opml::parse(&data) else {
        return error(StatusCode::BAD_REQUEST, "Invalid OPML file");
    };
    if feeds.len() > MAX_OPML_FEEDS {
        return error(
            StatusCode::BAD_REQUEST,
            "too many feeds in OPML file (max 500)",
        );
    }

    let (mut imported, mut skipped, mut errors) = (0, 0, Vec::<String>::new());
    for f in feeds {
        let Some(url) = valid_feed_url(&f.url) else {
            errors.push(format!(
                "Invalid URL: {}",
                text::truncate_chars(&f.url, 200)
            ));
            skipped += 1;
            continue;
        };
        let site = valid_feed_url(&f.site_url);
        match repo::feed_exists(&state.pool, user.id, &url).await {
            Ok(true) => {
                skipped += 1;
                continue;
            }
            Ok(false) => {}
            Err(e) => {
                tracing::warn!("OPML import: checking {url}: {e}");
                errors.push(format!(
                    "Could not import {}",
                    text::truncate_chars(&url, 200)
                ));
                skipped += 1;
                continue;
            }
        }
        let title = if f.title.is_empty() {
            url.clone()
        } else {
            text::truncate_chars(&f.title, 512).to_string()
        };
        match repo::create_feed(
            &state.pool,
            Uuid::new_v4(),
            user.id,
            &url,
            &title,
            site.as_deref(),
        )
        .await
        {
            Ok(_) => imported += 1,
            Err(e) => {
                tracing::warn!("OPML import: creating {url}: {e}");
                errors.push(format!(
                    "Could not import {}",
                    text::truncate_chars(&url, 200)
                ));
                skipped += 1;
            }
        }
    }
    // Fetch the newly imported feeds right away.
    if imported > 0 {
        state.fetcher.refresh_user(user.id);
    }
    let mut out = json!({ "imported": imported, "skipped": skipped });
    if !errors.is_empty() {
        out["errors"] = json!(errors);
    }
    ok(out)
}

pub async fn export_opml(
    AxState(state): AxState<State>,
    Extension(user): Extension<User>,
) -> Response {
    let feeds = match repo::feeds_for_user(&state.pool, user.id).await {
        Ok(f) => f,
        Err(e) => return internal("listing feeds", e, "Failed to get feeds"),
    };
    let infos: Vec<opml::FeedInfo> = feeds
        .into_iter()
        .map(|f| opml::FeedInfo {
            url: f.url,
            title: f.title,
            site_url: f.site_url.unwrap_or_default(),
        })
        .collect();
    (
        [
            (header::CONTENT_TYPE, "application/xml"),
            (
                header::CONTENT_DISPOSITION,
                "attachment; filename=flowreader-feeds.opml",
            ),
        ],
        opml::generate("FlowReader Feeds", &infos),
    )
        .into_response()
}

// ------------------------------------------------------------- articles ---

#[derive(Deserialize, Default)]
#[serde(default)]
pub struct ListQuery {
    limit: Option<String>,
    cursor: Option<String>,
    unread: Option<String>,
    q: Option<String>,
    offset: Option<String>,
}

fn parse_limit(raw: Option<&str>) -> i64 {
    match raw.and_then(|l| l.parse::<i64>().ok()) {
        Some(l) if (1..=100).contains(&l) => l,
        _ => 30,
    }
}

/// Reads `?cursor=<RFC 3339 sort_at>,<uuid>` (the last item of the previous page).
fn parse_cursor(raw: Option<&str>) -> Result<Option<ArticleCursor>, ()> {
    let Some(raw) = raw.filter(|r| !r.is_empty()) else {
        return Ok(None);
    };
    let (ts, id) = raw.split_once(',').ok_or(())?;
    let sort_at = DateTime::parse_from_rfc3339(ts)
        .map_err(|_| ())?
        .with_timezone(&Utc);
    let id = Uuid::parse_str(id).map_err(|_| ())?;
    Ok(Some(ArticleCursor { sort_at, id }))
}

async fn list(state: &State, user: &User, q: &ListQuery, mut f: ArticleFilter) -> Response {
    let Ok(cursor) = parse_cursor(q.cursor.as_deref()) else {
        return error(StatusCode::BAD_REQUEST, "Invalid cursor");
    };
    f.user_id = user.id;
    f.cursor = cursor;
    f.limit = parse_limit(q.limit.as_deref());
    f.unread_only = f.unread_only || q.unread.as_deref() == Some("true");
    match repo::list_articles(&state.pool, &f).await {
        Ok(a) => ok(a),
        Err(e) => internal("listing articles", e, "Failed to get articles"),
    }
}

pub async fn list_articles(
    AxState(state): AxState<State>,
    Extension(user): Extension<User>,
    Query(q): Query<ListQuery>,
) -> Response {
    list(&state, &user, &q, ArticleFilter::default()).await
}

pub async fn list_favorites(
    AxState(state): AxState<State>,
    Extension(user): Extension<User>,
    Query(q): Query<ListQuery>,
) -> Response {
    list(
        &state,
        &user,
        &q,
        ArticleFilter {
            favorites_only: true,
            ..Default::default()
        },
    )
    .await
}

pub async fn list_feed_articles(
    AxState(state): AxState<State>,
    Extension(user): Extension<User>,
    Path(id): Path<String>,
    Query(q): Query<ListQuery>,
) -> Response {
    match parse_id(&id, "feed") {
        Ok(feed_id) => {
            list(
                &state,
                &user,
                &q,
                ArticleFilter {
                    feed_id: Some(feed_id),
                    ..Default::default()
                },
            )
            .await
        }
        Err(e) => e,
    }
}

pub async fn search_articles(
    AxState(state): AxState<State>,
    Extension(user): Extension<User>,
    Query(q): Query<ListQuery>,
) -> Response {
    let query = q.q.as_deref().unwrap_or("").trim();
    if query.is_empty() {
        return ok(Vec::<Value>::new());
    }
    let query = text::truncate_chars(query, 200);
    let offset = match q.offset.as_deref().and_then(|o| o.parse::<i64>().ok()) {
        Some(o) if (0..=10_000).contains(&o) => o,
        _ => 0,
    };
    match repo::search_articles(
        &state.pool,
        user.id,
        query,
        parse_limit(q.limit.as_deref()),
        offset,
    )
    .await
    {
        Ok(a) => ok(a),
        Err(e) => internal("searching articles", e, "Failed to search articles"),
    }
}

pub async fn get_article(
    AxState(state): AxState<State>,
    Extension(user): Extension<User>,
    Path(id): Path<String>,
) -> Response {
    let id = match parse_id(&id, "article") {
        Ok(id) => id,
        Err(e) => return e,
    };
    match repo::article_for_user(&state.pool, id, user.id).await {
        Ok(Some(mut a)) => {
            // Sanitized at ingest; sanitizing again is cheap for one article
            // and keeps defence in depth for rows not yet backfilled.
            a.content = sanitize::sanitize(&a.content);
            a.summary = sanitize::sanitize(&a.summary);
            let mut resp = ok(a);
            resp.headers_mut().insert(
                header::CACHE_CONTROL,
                HeaderValue::from_static("private, no-cache"),
            );
            resp
        }
        Ok(None) => error(StatusCode::NOT_FOUND, "Article not found"),
        Err(e) => internal("getting article", e, "Failed to get article"),
    }
}

async fn set_read(state: State, user: User, id: String, read: bool) -> Response {
    let id = match parse_id(&id, "article") {
        Ok(id) => id,
        Err(e) => return e,
    };
    match repo::set_read(&state.pool, id, user.id, read).await {
        Ok(true) => {
            state.hub.send_to_user(
                user.id,
                "article_updated",
                json!({ "id": id, "is_read": read }),
            );
            ok(json!({ "is_read": read }))
        }
        Ok(false) => error(StatusCode::NOT_FOUND, "Article not found"),
        Err(e) => internal("setting read state", e, "Failed to update article"),
    }
}

pub async fn mark_read(
    AxState(state): AxState<State>,
    Extension(user): Extension<User>,
    Path(id): Path<String>,
) -> Response {
    set_read(state, user, id, true).await
}

pub async fn mark_unread(
    AxState(state): AxState<State>,
    Extension(user): Extension<User>,
    Path(id): Path<String>,
) -> Response {
    set_read(state, user, id, false).await
}

pub async fn toggle_favorite(
    AxState(state): AxState<State>,
    Extension(user): Extension<User>,
    Path(id): Path<String>,
) -> Response {
    let id = match parse_id(&id, "article") {
        Ok(id) => id,
        Err(e) => return e,
    };
    match repo::toggle_favorite(&state.pool, id, user.id).await {
        Ok(Some(fav)) => {
            state.hub.send_to_user(
                user.id,
                "article_updated",
                json!({ "id": id, "is_favorite": fav }),
            );
            ok(json!({ "is_favorite": fav }))
        }
        Ok(None) => error(StatusCode::NOT_FOUND, "Article not found"),
        Err(e) => internal("toggling favorite", e, "Failed to toggle favorite"),
    }
}

pub async fn mark_feed_read(
    AxState(state): AxState<State>,
    Extension(user): Extension<User>,
    Path(id): Path<String>,
) -> Response {
    let feed_id = match parse_id(&id, "feed") {
        Ok(id) => id,
        Err(e) => return e,
    };
    match repo::mark_feed_read(&state.pool, feed_id, user.id).await {
        Ok(n) => {
            if n > 0 {
                state.hub.send_to_user(
                    user.id,
                    "articles_bulk_read",
                    json!({ "feed_id": feed_id }),
                );
            }
            ok(json!({ "message": "All articles marked as read", "count": n }))
        }
        Err(e) => internal("marking feed read", e, "Failed to mark all as read"),
    }
}

pub async fn mark_all_read(
    AxState(state): AxState<State>,
    Extension(user): Extension<User>,
) -> Response {
    match repo::mark_all_read(&state.pool, user.id).await {
        Ok(n) => {
            if n > 0 {
                state
                    .hub
                    .send_to_user(user.id, "articles_bulk_read", json!({}));
            }
            ok(json!({ "message": "All articles marked as read", "count": n }))
        }
        Err(e) => internal("marking all read", e, "Failed to mark all as read"),
    }
}

pub async fn summarize(
    AxState(state): AxState<State>,
    Extension(user): Extension<User>,
    Path(id): Path<String>,
) -> Response {
    let id = match parse_id(&id, "article") {
        Ok(id) => id,
        Err(e) => return e,
    };
    let article = match repo::article_for_user(&state.pool, id, user.id).await {
        Ok(Some(a)) => a,
        Ok(None) => return error(StatusCode::NOT_FOUND, "Article not found"),
        Err(e) => return internal("getting article", e, "Failed to get article"),
    };
    if !article.ai_summary.is_empty() {
        return ok(json!({ "summary": article.ai_summary }));
    }
    if !state.ai.enabled() {
        return error(
            StatusCode::SERVICE_UNAVAILABLE,
            "AI summaries are not configured",
        );
    }

    let mut content = text::plain_text(&article.content);
    if content.is_empty() {
        content = text::plain_text(&article.summary);
    }
    // Prefer the full page text when it is longer than the feed's.
    if !article.url.is_empty() {
        if let Ok(full) = state.extractor.extract(&article.url).await {
            if full.len() > content.len() {
                content = full;
            }
        }
    }
    let Some(summary) = state
        .ai
        .summarize(&format!("Titre : {}\n\n{}", article.title, content))
        .await
    else {
        return error(StatusCode::BAD_GATEWAY, "Failed to generate summary");
    };
    if let Err(e) = repo::set_ai_summary(&state.pool, id, &summary).await {
        return internal("saving summary", e, "Failed to persist summary");
    }
    state.hub.send_to_user(
        user.id,
        "article_updated",
        json!({ "id": id, "ai_summary": summary }),
    );
    ok(json!({ "summary": summary }))
}

// ------------------------------------------------------------ websocket ---

const PONG_WAIT: Duration = Duration::from_secs(60);
const PING_PERIOD: Duration = Duration::from_secs(54);
const WRITE_WAIT: Duration = Duration::from_secs(10);

/// Same-origin check against Cross-Site WebSocket Hijacking. Requests without
/// an Origin (non-browser clients) are allowed.
fn ws_origin_allowed(state: &State, headers: &HeaderMap) -> bool {
    let Some(origin) = headers.get(header::ORIGIN).and_then(|v| v.to_str().ok()) else {
        return true;
    };
    let Ok(u) = url::Url::parse(origin) else {
        return false;
    };
    let host = headers
        .get(header::HOST)
        .and_then(|v| v.to_str().ok())
        .unwrap_or("");
    let origin_host = mw::origin_host(&u).to_ascii_lowercase();
    origin_host.eq_ignore_ascii_case(host) || state.config.ws_allowed_origins.contains(&origin_host)
}

pub async fn websocket(
    AxState(state): AxState<State>,
    Extension(user): Extension<User>,
    headers: HeaderMap,
    ws: WebSocketUpgrade,
) -> Response {
    if !ws_origin_allowed(&state, &headers) {
        return error(StatusCode::FORBIDDEN, "Origin not allowed");
    }
    ws.max_message_size(512)
        .on_upgrade(move |socket| serve_socket(state, user.id, socket))
}

async fn serve_socket(state: State, user_id: Uuid, socket: WebSocket) {
    let (conn, mut rx) = state.hub.register(user_id);
    let (mut sink, mut stream) = socket.split();

    let writer = async {
        let mut ping = tokio::time::interval(PING_PERIOD);
        ping.tick().await;
        loop {
            let msg = tokio::select! {
                m = rx.recv() => match m {
                    // One frame per event so the client can JSON.parse each one.
                    Some(text) => Message::Text(text.into()),
                    None => Message::Close(None),
                },
                _ = ping.tick() => Message::Ping(Default::default()),
            };
            let closing = matches!(msg, Message::Close(_));
            match tokio::time::timeout(WRITE_WAIT, sink.send(msg)).await {
                Ok(Ok(())) if !closing => {}
                _ => return,
            }
        }
    };
    // Clients don't send data; reading only tracks liveness (pongs).
    let reader = async {
        loop {
            match tokio::time::timeout(PONG_WAIT, stream.next()).await {
                Ok(Some(Ok(Message::Close(_)))) | Ok(Some(Err(_))) | Ok(None) | Err(_) => return,
                Ok(Some(Ok(_))) => {}
            }
        }
    };
    tokio::select! {
        _ = writer => {},
        _ = reader => {},
    }
    state.hub.unregister(user_id, conn);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn cursor_parsing() {
        assert!(parse_cursor(None).unwrap().is_none());
        let c = parse_cursor(Some(
            "2026-10-05T12:00:00.123456Z,6f1e9d2a-3b4c-4d5e-8f70-112233445566",
        ))
        .unwrap()
        .unwrap();
        assert_eq!(c.sort_at.timestamp_subsec_micros(), 123456);
        assert!(parse_cursor(Some("nope")).is_err());
    }

    #[test]
    fn feed_url_validation() {
        assert!(valid_feed_url("https://example.org/feed").is_some());
        assert!(valid_feed_url("javascript:alert(1)").is_none());
        assert!(valid_feed_url("/relative").is_none());
    }
}

//! HTTP layer: router, middleware and handlers.

mod api;
mod middleware;
mod ratelimit;
mod spa;

use std::sync::Arc;
use std::time::Duration;

use axum::extract::DefaultBodyLimit;
use axum::http::StatusCode;
use axum::routing::{get, post};
use axum::{middleware as mw, Router};
use sqlx::PgPool;
use tower_http::compression::CompressionLayer;
use tower_http::timeout::TimeoutLayer;
use tower_http::trace::TraceLayer;

use crate::ai::AiService;
use crate::config::Config;
use crate::extractor::Extractor;
use crate::fetch::FetchService;
use crate::hub::Hub;
use ratelimit::RateLimiter;

pub struct AppState {
    pub pool: PgPool,
    pub config: Config,
    pub hub: Arc<Hub>,
    pub fetcher: Arc<FetchService>,
    pub ai: AiService,
    pub extractor: Extractor,
    pub auth_limiter: RateLimiter,
    pub summary_limiter: RateLimiter,
}

pub type State = Arc<AppState>;

pub fn new_state(pool: PgPool, config: Config, hub: Arc<Hub>, fetcher: Arc<FetchService>) -> State {
    Arc::new(AppState {
        pool,
        config,
        hub,
        fetcher,
        ai: AiService::from_env(),
        extractor: Extractor::new(),
        // 10 requests/minute per IP with a small burst (brute-force guard).
        auth_limiter: RateLimiter::new(10, 5),
        // AI summaries are slow and costly: per-user limit.
        summary_limiter: RateLimiter::new(6, 3),
    })
}

fn timeout(secs: u64) -> TimeoutLayer {
    TimeoutLayer::with_status_code(StatusCode::GATEWAY_TIMEOUT, Duration::from_secs(secs))
}

pub fn router(state: State) -> Router {
    let auth = Router::new()
        .route("/register", post(api::register))
        .route("/login", post(api::login))
        .route("/logout", post(api::logout))
        .route_layer(mw::from_fn_with_state(
            state.clone(),
            middleware::auth_rate_limit,
        ));

    let admin = Router::new()
        .route("/users", get(api::list_users))
        .route("/users/{id}", axum::routing::delete(api::delete_user))
        .route_layer(mw::from_fn(middleware::admin_only));

    // Everything here requires a valid session (one SQL lookup).
    let private = Router::new()
        .route("/users/me", get(api::me))
        .route("/feeds", get(api::list_feeds).post(api::add_feed))
        .route("/feeds/", get(api::list_feeds).post(api::add_feed))
        .route("/feeds/refresh", post(api::refresh_feeds))
        .route("/feeds/export/opml", get(api::export_opml))
        .route(
            "/feeds/{id}",
            get(api::get_feed)
                .patch(api::update_feed)
                .delete(api::delete_feed),
        )
        .route("/feeds/{id}/articles", get(api::list_feed_articles))
        .route("/feeds/{id}/read-all", post(api::mark_feed_read))
        .route("/articles", get(api::list_articles))
        .route("/articles/", get(api::list_articles))
        .route("/articles/search", get(api::search_articles))
        .route("/articles/read-all", post(api::mark_all_read))
        .route("/articles/favorites", get(api::list_favorites))
        .route("/articles/{id}", get(api::get_article))
        .route(
            "/articles/{id}/read",
            post(api::mark_read).delete(api::mark_unread),
        )
        .route("/articles/{id}/favorite", post(api::toggle_favorite))
        .nest("/admin", admin)
        .route_layer(mw::from_fn_with_state(
            state.clone(),
            middleware::require_auth,
        ));

    // Regular JSON endpoints: compressed, 1 MiB bodies, 30 s budget.
    let json_api = Router::new()
        .route("/", get(api::index))
        .nest("/auth", auth)
        .merge(private)
        .layer(DefaultBodyLimit::max(1 << 20))
        .layer(timeout(30))
        .layer(CompressionLayer::new());

    // OPML import: larger body.
    let import = Router::new()
        .route("/feeds/import/opml", post(api::import_opml))
        .route_layer(mw::from_fn_with_state(
            state.clone(),
            middleware::require_auth,
        ))
        .layer(DefaultBodyLimit::max(5 << 20))
        .layer(timeout(60));

    // AI summaries: page extraction + LLM call, so a longer budget and a
    // per-user rate limit.
    let summarize = Router::new()
        .route("/articles/{id}/summarize", post(api::summarize))
        .route_layer(mw::from_fn_with_state(
            state.clone(),
            middleware::summary_rate_limit,
        ))
        .route_layer(mw::from_fn_with_state(
            state.clone(),
            middleware::require_auth,
        ))
        .layer(DefaultBodyLimit::max(1 << 10))
        .layer(timeout(90));

    // WebSocket: no compression or timeout (long-lived upgraded connection).
    let ws = Router::new()
        .route("/ws", get(api::websocket))
        .route_layer(mw::from_fn_with_state(
            state.clone(),
            middleware::require_auth,
        ));

    let v1 = Router::new()
        .merge(import)
        .merge(summarize)
        .merge(ws)
        .merge(json_api)
        .fallback(api::not_found)
        .layer(mw::from_fn(middleware::no_store))
        .layer(mw::from_fn(middleware::same_origin_guard));

    let mut app = Router::new()
        .route("/health", get(api::health))
        .route("/api/v1/", get(api::index))
        .nest("/api/v1", v1);
    if state.config.static_dir.join("index.html").is_file() {
        app = app.fallback_service(spa::router(state.config.static_dir.clone()));
    }

    app.layer(mw::from_fn_with_state(
        state.clone(),
        middleware::security_headers,
    ))
    .layer(TraceLayer::new_for_http())
    .with_state(state)
}

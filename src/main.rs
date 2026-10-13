//! FlowReader server: REST + WebSocket API, feed fetcher and static frontend.

mod ai;
mod auth;
mod config;
mod db;
mod extractor;
mod fetch;
mod hub;
mod models;
mod opml;
mod parser;
mod repo;
mod safehttp;
mod sanitize;
mod text;
mod web;
mod workers;

use std::net::SocketAddr;
use std::sync::Arc;

use anyhow::Context;
use tracing_subscriber::EnvFilter;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    tracing_subscriber::fmt()
        .with_env_filter(
            EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| EnvFilter::new("info,tower_http=info,sqlx=warn")),
        )
        .with_ansi(std::io::IsTerminal::is_terminal(&std::io::stderr()))
        .init();

    let config = config::Config::from_env();
    let pool = db::connect(&config.database_url).await?;
    // A failed migration is reported but doesn't stop the server.
    if let Err(e) = db::migrate(&pool, &config.migrations_dir).await {
        tracing::error!("migration check warning: {e:#}");
    }

    let hub = Arc::new(hub::Hub::default());
    // Modest outbound concurrency so fetches don't starve the 10-connection pool.
    let fetcher = fetch::FetchService::new(pool.clone(), hub.clone(), 4);
    let state = web::new_state(pool.clone(), config.clone(), hub, fetcher.clone());

    auth::init();
    workers::spawn_fetcher(fetcher);
    let limiter_state = state.clone();
    workers::spawn_maintenance(
        pool.clone(),
        vec![Arc::new(move || {
            limiter_state.auth_limiter.cleanup();
            limiter_state.summary_limiter.cleanup();
        })],
    );

    let app = web::router(state);
    let addr = SocketAddr::from(([0, 0, 0, 0], config.port));
    let listener = tokio::net::TcpListener::bind(addr)
        .await
        .with_context(|| format!("binding {addr}"))?;
    tracing::info!("server starting on port {}", config.port);
    axum::serve(
        listener,
        app.into_make_service_with_connect_info::<SocketAddr>(),
    )
    .with_graceful_shutdown(shutdown_signal())
    .await?;
    pool.close().await;
    tracing::info!("server exited properly");
    Ok(())
}

async fn shutdown_signal() {
    let ctrl_c = async {
        let _ = tokio::signal::ctrl_c().await;
    };
    #[cfg(unix)]
    let term = async {
        if let Ok(mut s) = tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate())
        {
            s.recv().await;
        }
    };
    #[cfg(not(unix))]
    let term = std::future::pending::<()>();
    tokio::select! {
        _ = ctrl_c => {},
        _ = term => {},
    }
    tracing::info!("shutting down server");
}

//! Configuration from environment variables.

use std::net::IpAddr;
use std::path::PathBuf;

use ipnet::IpNet;

#[derive(Debug, Clone)]
pub struct Config {
    pub port: u16,
    pub database_url: String,
    pub static_dir: PathBuf,
    pub migrations_dir: PathBuf,
    /// REGISTRATION_ENABLED=false closes sign-ups; the first account (admin
    /// bootstrap) is always allowed.
    pub registration_enabled: bool,
    /// CIDRs whose X-Forwarded-For header is believed (TRUSTED_PROXIES).
    pub trusted_proxies: Vec<IpNet>,
    /// COOKIE_SECURE override: Some(true/false) or None for auto-detection.
    pub cookie_secure: Option<bool>,
    /// Extra hosts allowed as WebSocket origins (WS_ALLOWED_ORIGINS).
    pub ws_allowed_origins: Vec<String>,
}

fn env(key: &str) -> Option<String> {
    std::env::var(key).ok()
}

fn parse_bool(raw: &str) -> Option<bool> {
    match raw.trim().to_ascii_lowercase().as_str() {
        "true" | "1" | "yes" => Some(true),
        "false" | "0" | "no" => Some(false),
        _ => None,
    }
}

pub fn parse_prefixes(raw: &str) -> Vec<IpNet> {
    raw.split(',')
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .filter_map(|s| {
            if s.contains('/') {
                s.parse::<IpNet>().ok().map(|n| n.trunc())
            } else {
                s.parse::<IpAddr>().ok().map(IpNet::from)
            }
        })
        .collect()
}

impl Config {
    pub fn from_env() -> Self {
        Self {
            port: env("PORT").and_then(|p| p.parse().ok()).unwrap_or(8080),
            database_url: env("DATABASE_URL").unwrap_or_else(|| {
                "postgres://flowreader:flowreader@db:5432/flowreader?sslmode=disable".into()
            }),
            static_dir: env("STATIC_DIR")
                .unwrap_or_else(|| "./web/dist".into())
                .into(),
            migrations_dir: env("MIGRATIONS_DIR")
                .unwrap_or_else(|| "./migrations".into())
                .into(),
            registration_enabled: env("REGISTRATION_ENABLED")
                .and_then(|v| parse_bool(&v))
                .unwrap_or(true),
            trusted_proxies: parse_prefixes(&env("TRUSTED_PROXIES").unwrap_or_default()),
            cookie_secure: env("COOKIE_SECURE").and_then(|v| parse_bool(&v)),
            ws_allowed_origins: env("WS_ALLOWED_ORIGINS")
                .unwrap_or_default()
                .split(',')
                .map(|o| o.trim().to_ascii_lowercase())
                .filter(|o| !o.is_empty())
                .collect(),
        }
    }
}

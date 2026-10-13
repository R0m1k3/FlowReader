//! Cross-cutting request handling: auth, CSRF guard, headers, rate limits.

use std::net::{IpAddr, SocketAddr};

use axum::extract::{ConnectInfo, Request, State as AxState};
use axum::http::header::{self, HeaderMap, HeaderValue};
use axum::http::{Method, StatusCode};
use axum::middleware::Next;
use axum::response::{IntoResponse, Response};
use ipnet::IpNet;

use super::api::error;
use super::State;
use crate::models::{User, ROLE_ADMIN};
use crate::repo;

pub const SESSION_COOKIE: &str = "session_id";

pub fn cookie(headers: &HeaderMap, name: &str) -> Option<String> {
    headers
        .get_all(header::COOKIE)
        .iter()
        .filter_map(|v| v.to_str().ok())
        .flat_map(|v| v.split(';'))
        .filter_map(|kv| kv.trim().split_once('='))
        .find(|(k, _)| *k == name)
        .map(|(_, v)| v.trim_matches('"').to_string())
}

/// Resolves the session cookie once per request and stores the user in the
/// request extensions. Unauthenticated requests get 401.
pub async fn require_auth(
    AxState(state): AxState<State>,
    mut req: Request,
    next: Next,
) -> Response {
    let Some(token) = cookie(req.headers(), SESSION_COOKIE).filter(|t| !t.is_empty()) else {
        return error(StatusCode::UNAUTHORIZED, "Not authenticated");
    };
    match repo::user_by_token(&state.pool, &token).await {
        Ok(Some(user)) => {
            req.extensions_mut().insert(user);
            next.run(req).await
        }
        Ok(None) => error(StatusCode::UNAUTHORIZED, "Session expired"),
        Err(e) => {
            tracing::error!("resolving session: {e}");
            error(
                StatusCode::INTERNAL_SERVER_ERROR,
                "Failed to resolve session",
            )
        }
    }
}

/// Restricts access to admins. Must run after `require_auth`.
pub async fn admin_only(req: Request, next: Next) -> Response {
    match req.extensions().get::<User>() {
        None => error(StatusCode::UNAUTHORIZED, "Not authenticated"),
        Some(u) if u.role != ROLE_ADMIN => error(StatusCode::FORBIDDEN, "Admin access required"),
        Some(_) => next.run(req).await,
    }
}

fn is_trusted(proxies: &[IpNet], ip: IpAddr) -> bool {
    let ip = unmap(ip);
    proxies.iter().any(|p| p.contains(&ip))
}

fn unmap(ip: IpAddr) -> IpAddr {
    match ip {
        IpAddr::V6(v6) => v6
            .to_ipv4_mapped()
            .map(IpAddr::V4)
            .unwrap_or(IpAddr::V6(v6)),
        v4 => v4,
    }
}

/// The peer address, honouring X-Forwarded-For only when the direct peer is a
/// trusted proxy. The right-most untrusted hop is used (not spoofable).
pub fn client_ip_from(proxies: &[IpNet], peer: Option<IpAddr>, headers: &HeaderMap) -> String {
    let Some(peer) = peer else {
        return String::new();
    };
    if !is_trusted(proxies, peer) {
        return unmap(peer).to_string();
    }
    let xff = headers
        .get_all("x-forwarded-for")
        .iter()
        .filter_map(|v| v.to_str().ok())
        .collect::<Vec<_>>()
        .join(",");
    for hop in xff.split(',').rev() {
        match hop.trim().parse::<IpAddr>() {
            Ok(ip) if !is_trusted(proxies, ip) => return unmap(ip).to_string(),
            Ok(_) => continue,
            Err(_) => break,
        }
    }
    unmap(peer).to_string()
}

pub fn client_ip(state: &State, req_ext: &axum::http::Extensions, headers: &HeaderMap) -> String {
    let peer = req_ext.get::<ConnectInfo<SocketAddr>>().map(|c| c.0.ip());
    client_ip_from(&state.config.trusted_proxies, peer, headers)
}

fn too_many() -> Response {
    let mut resp = error(
        StatusCode::TOO_MANY_REQUESTS,
        "Too many requests. Please slow down.",
    );
    resp.headers_mut()
        .insert(header::RETRY_AFTER, HeaderValue::from_static("60"));
    resp
}

pub async fn auth_rate_limit(AxState(state): AxState<State>, req: Request, next: Next) -> Response {
    let key = client_ip(&state, req.extensions(), req.headers());
    if !state.auth_limiter.allow(&key) {
        return too_many();
    }
    next.run(req).await
}

/// Per-user limit for expensive endpoints. Must run after `require_auth`.
pub async fn summary_rate_limit(
    AxState(state): AxState<State>,
    req: Request,
    next: Next,
) -> Response {
    let key = match req.extensions().get::<User>() {
        Some(u) => u.id.to_string(),
        None => client_ip(&state, req.extensions(), req.headers()),
    };
    if !state.summary_limiter.allow(&key) {
        return too_many();
    }
    next.run(req).await
}

/// Rejects state-changing requests coming from another site (CSRF defence in
/// depth on top of SameSite=Strict cookies).
pub async fn same_origin_guard(req: Request, next: Next) -> Response {
    if matches!(*req.method(), Method::GET | Method::HEAD | Method::OPTIONS) {
        return next.run(req).await;
    }
    let headers = req.headers();
    let blocked = if let Some(site) = headers.get("sec-fetch-site").and_then(|v| v.to_str().ok()) {
        site != "same-origin" && site != "none"
    } else if let Some(origin) = headers.get(header::ORIGIN).and_then(|v| v.to_str().ok()) {
        let host = headers
            .get(header::HOST)
            .and_then(|v| v.to_str().ok())
            .unwrap_or("");
        !origin_matches_host(origin, host)
    } else {
        false
    };
    if blocked {
        return error(StatusCode::FORBIDDEN, "Cross-site request blocked");
    }
    next.run(req).await
}

/// Compares an Origin header's host[:port] with the request Host.
pub fn origin_matches_host(origin: &str, host: &str) -> bool {
    match url::Url::parse(origin) {
        Ok(u) => origin_host(&u).eq_ignore_ascii_case(host),
        Err(_) => false,
    }
}

pub fn origin_host(u: &url::Url) -> String {
    let host = u.host_str().unwrap_or("");
    match u.port() {
        Some(p) => format!("{host}:{p}"),
        None => host.to_string(),
    }
}

/// API responses are never cached unless a handler says otherwise.
pub async fn no_store(req: Request, next: Next) -> Response {
    let mut resp = next.run(req).await;
    resp.headers_mut()
        .entry(header::CACHE_CONTROL)
        .or_insert(HeaderValue::from_static("no-store"));
    resp
}

/// Whether the session cookie should carry the Secure flag: COOKIE_SECURE
/// override, else TLS terminated by a proxy (X-Forwarded-Proto: https).
pub fn secure_cookie(state: &State, headers: &HeaderMap) -> bool {
    if let Some(v) = state.config.cookie_secure {
        return v;
    }
    headers
        .get("x-forwarded-proto")
        .and_then(|v| v.to_str().ok())
        .is_some_and(|v| v.eq_ignore_ascii_case("https"))
}

const CSP: &str = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; \
img-src * data: blob:; media-src *; font-src 'self' data:; connect-src 'self'; \
frame-src 'none'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; \
form-action 'self'; manifest-src 'self'; worker-src 'self'";

/// Defensive response headers, including a CSP that backstops the HTML
/// sanitizer for feed content.
pub async fn security_headers(
    AxState(state): AxState<State>,
    req: Request,
    next: Next,
) -> Response {
    let secure = secure_cookie(&state, req.headers());
    let mut resp = next.run(req).await.into_response();
    let h = resp.headers_mut();
    h.insert(
        "x-content-type-options",
        HeaderValue::from_static("nosniff"),
    );
    h.insert("x-frame-options", HeaderValue::from_static("DENY"));
    h.insert(
        "referrer-policy",
        HeaderValue::from_static("strict-origin-when-cross-origin"),
    );
    h.insert(
        "permissions-policy",
        HeaderValue::from_static("geolocation=(), microphone=(), camera=()"),
    );
    h.insert("content-security-policy", HeaderValue::from_static(CSP));
    h.insert(
        "cross-origin-opener-policy",
        HeaderValue::from_static("same-origin"),
    );
    if secure {
        h.insert(
            "strict-transport-security",
            HeaderValue::from_static("max-age=31536000"),
        );
    }
    resp
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::config::parse_prefixes;

    fn xff(v: &str) -> HeaderMap {
        let mut h = HeaderMap::new();
        h.insert("x-forwarded-for", HeaderValue::from_str(v).unwrap());
        h
    }

    #[test]
    fn ignores_spoofed_headers_without_trusted_proxy() {
        let ip = client_ip_from(&[], Some("203.0.113.7".parse().unwrap()), &xff("1.2.3.4"));
        assert_eq!(ip, "203.0.113.7");
    }

    #[test]
    fn uses_rightmost_untrusted_hop() {
        let proxies = parse_prefixes("10.0.0.0/8");
        let ip = client_ip_from(
            &proxies,
            Some("10.0.0.2".parse().unwrap()),
            &xff("6.6.6.6, 198.51.100.9, 10.0.0.3"),
        );
        assert_eq!(ip, "198.51.100.9");
    }

    #[test]
    fn origin_check() {
        assert!(origin_matches_host(
            "http://reader.example:8080",
            "reader.example:8080"
        ));
        assert!(!origin_matches_host(
            "https://evil.example",
            "reader.example"
        ));
    }
}

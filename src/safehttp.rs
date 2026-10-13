//! Outbound HTTP hardened against SSRF: only public addresses may be reached.
//!
//! Hostnames go through a resolver that refuses any non-public address, so
//! every connection (including redirects and DNS rebinding) is checked at the
//! moment its address is chosen. Literal IPs are checked up front and on each
//! redirect hop.

use std::net::{IpAddr, SocketAddr};
use std::sync::{Arc, LazyLock};
use std::time::Duration;

use ipnet::IpNet;
use reqwest::dns::{Addrs, Name, Resolve, Resolving};
use url::Url;

#[derive(Debug)]
pub enum UrlError {
    Invalid,
    Scheme,
    Blocked(String),
    Resolve,
}

impl std::fmt::Display for UrlError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            UrlError::Invalid => write!(f, "invalid URL"),
            UrlError::Scheme => write!(f, "unsupported scheme"),
            UrlError::Blocked(h) => write!(f, "blocked request to non-public host: {h}"),
            UrlError::Resolve => write!(f, "resolving host failed"),
        }
    }
}

impl std::error::Error for UrlError {}

static EXTRA_BLOCKED: LazyLock<Vec<IpNet>> = LazyLock::new(|| {
    [
        "192.0.0.0/24",   // IETF protocol assignments
        "198.18.0.0/15",  // benchmarking
        "240.0.0.0/4",    // reserved + broadcast
        "0.0.0.0/8",      // "this network"
        "100.64.0.0/10",  // CGNAT
        "::/96",          // IPv4-compatible (deprecated)
        "64:ff9b::/96",   // NAT64
        "64:ff9b:1::/48", // local-use NAT64
        "2002::/16",      // 6to4
        "2001::/32",      // Teredo
        "100::/64",       // discard-only
        "fc00::/7",       // unique local
        "fe80::/10",      // link-local
        "ff00::/8",       // multicast
    ]
    .iter()
    .map(|s| s.parse().expect("valid prefix"))
    .collect()
});

/// Reports whether an IP is private, loopback, link-local, unspecified or
/// otherwise unsafe to fetch.
pub fn is_disallowed_ip(ip: IpAddr) -> bool {
    let ip = match ip {
        IpAddr::V6(v6) => match v6.to_ipv4_mapped() {
            Some(v4) => IpAddr::V4(v4),
            None => IpAddr::V6(v6),
        },
        v4 => v4,
    };
    let basic = match ip {
        IpAddr::V4(v4) => {
            v4.is_loopback()
                || v4.is_private()
                || v4.is_unspecified()
                || v4.is_link_local()
                || v4.is_multicast()
                || v4.is_broadcast()
        }
        IpAddr::V6(v6) => v6.is_loopback() || v6.is_unspecified() || v6.is_multicast(),
    };
    basic || EXTRA_BLOCKED.iter().any(|net| net.contains(&ip))
}

/// Parses `raw`, enforces http(s) and refuses literal non-public IPs.
/// Hostnames are checked when they are resolved (see [`client`]).
pub fn check_url(raw: &str) -> Result<Url, UrlError> {
    let u = Url::parse(raw.trim()).map_err(|_| UrlError::Invalid)?;
    if u.scheme() != "http" && u.scheme() != "https" {
        return Err(UrlError::Scheme);
    }
    match u.host() {
        None => Err(UrlError::Invalid),
        Some(url::Host::Ipv4(ip)) if is_disallowed_ip(IpAddr::V4(ip)) => {
            Err(UrlError::Blocked(ip.to_string()))
        }
        Some(url::Host::Ipv6(ip)) if is_disallowed_ip(IpAddr::V6(ip)) => {
            Err(UrlError::Blocked(ip.to_string()))
        }
        Some(_) => Ok(u),
    }
}

/// Resolver that fails when any address of a host is non-public.
struct PublicResolver;

impl Resolve for PublicResolver {
    fn resolve(&self, name: Name) -> Resolving {
        Box::pin(async move {
            let host = name.as_str().to_string();
            let addrs: Vec<SocketAddr> = tokio::net::lookup_host((host.as_str(), 0))
                .await
                .map_err(|_| {
                    Box::new(UrlError::Resolve) as Box<dyn std::error::Error + Send + Sync>
                })?
                .collect();
            if addrs.is_empty() || addrs.iter().any(|a| is_disallowed_ip(a.ip())) {
                return Err(
                    Box::new(UrlError::Blocked(host)) as Box<dyn std::error::Error + Send + Sync>
                );
            }
            Ok(Box::new(addrs.into_iter()) as Addrs)
        })
    }
}

/// Builds an SSRF-hardened client with the given overall timeout.
pub fn client(timeout: Duration, user_agent: &str) -> reqwest::Client {
    let redirect = reqwest::redirect::Policy::custom(|attempt| {
        if attempt.previous().len() >= 5 {
            return attempt.error("too many redirects");
        }
        match check_url(attempt.url().as_str()) {
            Ok(_) => attempt.follow(),
            Err(e) => attempt.error(e),
        }
    });
    reqwest::Client::builder()
        .timeout(timeout)
        .connect_timeout(Duration::from_secs(10))
        .pool_idle_timeout(Duration::from_secs(90))
        .user_agent(user_agent)
        .redirect(redirect)
        // A proxy would resolve hosts itself and bypass the resolver check.
        .no_proxy()
        .dns_resolver(Arc::new(PublicResolver))
        .build()
        .expect("building HTTP client")
}

/// Reads at most `limit` bytes of a response body.
pub async fn read_limited(mut resp: reqwest::Response, limit: usize) -> anyhow::Result<Vec<u8>> {
    if resp.content_length().is_some_and(|n| n as usize > limit) {
        anyhow::bail!("response too large");
    }
    let mut buf = Vec::new();
    while let Some(chunk) = resp.chunk().await? {
        let room = limit.saturating_sub(buf.len());
        if chunk.len() > room {
            buf.extend_from_slice(&chunk[..room]);
            break;
        }
        buf.extend_from_slice(&chunk);
    }
    Ok(buf)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn blocks_internal_addresses() {
        for s in [
            "127.0.0.1",
            "10.1.2.3",
            "192.168.1.1",
            "169.254.169.254",
            "::1",
            "64:ff9b::a00:1",
            "2002:a00:1::1",
            "198.18.0.1",
            "100.64.0.1",
            "::ffff:127.0.0.1",
            "fd00::1",
        ] {
            assert!(
                is_disallowed_ip(s.parse().unwrap()),
                "{s} should be blocked"
            );
        }
        for s in ["1.1.1.1", "2606:4700:4700::1111"] {
            assert!(
                !is_disallowed_ip(s.parse().unwrap()),
                "{s} should be allowed"
            );
        }
    }

    #[test]
    fn check_url_rejects_bad_targets() {
        assert!(check_url("ftp://example.org/").is_err());
        assert!(check_url("http://127.0.0.1/").is_err());
        assert!(check_url("http://[::1]/").is_err());
        assert!(check_url("https://example.org/feed").is_ok());
    }
}

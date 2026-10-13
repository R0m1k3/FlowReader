//! Serves the built frontend: hashed assets are cached forever, HTML and
//! service-worker files must revalidate, unknown paths fall back to
//! index.html for client-side routing.

use std::path::{Component, Path, PathBuf};

use axum::body::Body;
use axum::extract::Request;
use axum::http::{header, HeaderValue, StatusCode};
use axum::response::{IntoResponse, Response};
use axum::Router;
use tower::util::ServiceExt;
use tower_http::compression::CompressionLayer;
use tower_http::services::ServeFile;

/// Router serving the frontend (compressed), used as the app fallback.
pub fn router(root: PathBuf) -> Router {
    Router::new()
        .fallback(move |req: Request| {
            let spa = Spa { root: root.clone() };
            async move { spa.serve(req).await }
        })
        .layer(CompressionLayer::new())
}

struct Spa {
    root: PathBuf,
}

fn cache_control(path: &str) -> &'static str {
    if path.starts_with("/assets/") {
        "public, max-age=31536000, immutable"
    } else if path.ends_with(".html")
        || path == "/sw.js"
        || path == "/registerSW.js"
        || path.starts_with("/workbox-")
        || path.ends_with(".webmanifest")
    {
        "no-cache"
    } else {
        "public, max-age=86400"
    }
}

/// Maps a URL path onto the root without ever leaving it.
fn resolve(root: &Path, url_path: &str) -> Option<PathBuf> {
    let mut out = root.to_path_buf();
    for comp in Path::new(url_path.trim_start_matches('/')).components() {
        match comp {
            Component::Normal(c) => out.push(c),
            Component::CurDir => {}
            _ => return None,
        }
    }
    Some(out)
}

impl Spa {
    async fn serve(&self, req: Request) -> Response {
        let path = req.uri().path().to_string();
        let file = resolve(&self.root, &path);
        let is_file = match &file {
            Some(f) => tokio::fs::metadata(f)
                .await
                .map(|m| m.is_file())
                .unwrap_or(false),
            None => false,
        };

        if !is_file {
            if path.starts_with("/assets/") || path.starts_with("/api/") {
                return StatusCode::NOT_FOUND.into_response();
            }
            let mut resp = self.file(self.root.join("index.html"), req).await;
            resp.headers_mut()
                .insert(header::CACHE_CONTROL, HeaderValue::from_static("no-cache"));
            return resp;
        }

        let mut resp = self.file(file.expect("checked above"), req).await;
        if resp.status().is_success() || resp.status() == StatusCode::NOT_MODIFIED {
            resp.headers_mut().insert(
                header::CACHE_CONTROL,
                HeaderValue::from_static(cache_control(&path)),
            );
        }
        resp
    }

    async fn file(&self, path: PathBuf, req: Request) -> Response {
        let mime = match path.extension().and_then(|e| e.to_str()) {
            Some("webmanifest") => Some("application/manifest+json"),
            _ => None,
        };
        let svc = match mime {
            Some(m) => ServeFile::new_with_mime(path, &m.parse().expect("valid mime")),
            None => ServeFile::new(path),
        };
        match svc.oneshot(req).await {
            Ok(r) => r.map(Body::new),
            Err(_) => StatusCode::INTERNAL_SERVER_ERROR.into_response(),
        }
    }
}

#[cfg(test)]
mod tests {
    #[test]
    fn resolve_stays_in_root() {
        let root = std::path::Path::new("/srv");
        assert!(super::resolve(root, "/../etc/passwd").is_none());
        assert_eq!(
            super::resolve(root, "/assets/a.js").unwrap(),
            std::path::Path::new("/srv/assets/a.js")
        );
    }
}

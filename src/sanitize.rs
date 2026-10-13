//! HTML sanitization for feed content (equivalent of a UGC policy).

use std::collections::HashSet;
use std::sync::LazyLock;

static POLICY: LazyLock<ammonia::Builder<'static>> = LazyLock::new(policy);

fn policy() -> ammonia::Builder<'static> {
    let mut b = ammonia::Builder::default();
    // http(s) and mailto only: no javascript:, data:, etc.
    b.url_schemes(HashSet::from(["http", "https", "mailto"]));
    // Relative links point at the feed's site, not at us: drop them.
    b.url_relative(ammonia::UrlRelative::Deny);
    // Article links open in a new tab instead of navigating away from the reader.
    b.link_rel(Some("noopener noreferrer nofollow"));
    b.set_tag_attribute_value("a", "target", "_blank");
    b.add_tag_attributes("img", ["loading", "srcset", "sizes"]);
    b.add_tags([
        "figure",
        "figcaption",
        "picture",
        "source",
        "video",
        "audio",
    ]);
    b.add_tag_attributes("source", ["src", "srcset", "type", "media"]);
    b.add_tag_attributes("video", ["src", "poster", "controls", "width", "height"]);
    b.add_tag_attributes("audio", ["src", "controls"]);
    b
}

/// Cleans untrusted HTML.
pub fn sanitize(html: &str) -> String {
    if html.is_empty() {
        return String::new();
    }
    POLICY.clean(html).to_string()
}

/// Cleans untrusted HTML, resolving relative links and images against
/// `base` (the article URL) instead of dropping them.
pub fn sanitize_with_base(html: &str, base: Option<&url::Url>) -> String {
    let Some(base) = base else {
        return sanitize(html);
    };
    if html.is_empty() {
        return String::new();
    }
    let mut b = policy();
    b.url_relative(ammonia::UrlRelative::RewriteWithBase(base.clone()));
    b.clean(html).to_string()
}

#[cfg(test)]
mod tests {
    #[test]
    fn strips_scripts_and_handlers() {
        let out = super::sanitize(
            r#"<p onclick="x()">Hi<script>alert(1)</script><a href="javascript:x">l</a><a href="https://e.org">ok</a></p>"#,
        );
        assert!(!out.contains("script"));
        assert!(!out.contains("onclick"));
        assert!(!out.contains("javascript"));
        assert!(out.contains(r#"href="https://e.org""#));
        assert!(out.contains(r#"target="_blank""#));
    }

    #[test]
    fn resolves_relative_urls_against_base() {
        let base = url::Url::parse("https://blog.example/2026/post/").unwrap();
        let out = super::sanitize_with_base(r#"<img src="a.jpg"><a href="/x">x</a>"#, Some(&base));
        assert!(out.contains(r#"src="https://blog.example/2026/post/a.jpg""#));
        assert!(out.contains(r#"href="https://blog.example/x""#));
        assert!(!super::sanitize(r#"<img src="a.jpg">"#).contains("a.jpg"));
    }
}

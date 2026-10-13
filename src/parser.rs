//! RSS/Atom/JSON feed download and parsing.

use chrono::{DateTime, Utc};
use feed_rs::model::{Entry, Link};
use scraper::{Html, Selector};
use sha2::{Digest, Sha256};
use std::collections::HashSet;
use std::sync::LazyLock;
use std::time::Duration;
use uuid::Uuid;

use crate::models::{Feed, NewArticle};
use crate::{safehttp, sanitize, text};

/// How much of a feed document is read.
const MAX_FEED_BYTES: usize = 10 << 20;

// Column limits from the schema (VARCHAR sizes); values are truncated on a
// character boundary so one oversized item can't abort the whole insert.
const MAX_TITLE: usize = 1024;
const MAX_FEED_TITLE: usize = 512;
const MAX_AUTHOR: usize = 256;
const MAX_URL: usize = 2048;
const MAX_GUID: usize = 512; // longer GUIDs are hashed
const EXCERPT_CHARS: usize = 320;

#[derive(Debug)]
pub enum FetchError {
    NotModified,
    Status(u16),
    TooLarge,
    Parse,
    Timeout,
    Blocked,
    Network,
}

impl FetchError {
    /// Short user-facing message, without resolver or dial details.
    pub fn public_message(&self) -> &'static str {
        match self {
            FetchError::NotModified => "",
            FetchError::Status(_) => "Réponse HTTP",
            FetchError::TooLarge => "Flux trop volumineux",
            FetchError::Parse => "Flux illisible (RSS/Atom invalide)",
            FetchError::Timeout => "Délai dépassé",
            FetchError::Blocked => "Adresse refusée",
            FetchError::Network => "Serveur injoignable",
        }
    }

    pub fn public(&self) -> String {
        match self {
            FetchError::Status(code) => format!("Réponse HTTP {code}"),
            other => other.public_message().to_string(),
        }
    }
}

impl std::fmt::Display for FetchError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            FetchError::Status(c) => write!(f, "unexpected status code: {c}"),
            other => write!(f, "{other:?}"),
        }
    }
}

fn classify(err: &reqwest::Error) -> FetchError {
    if err.is_timeout() {
        return FetchError::Timeout;
    }
    let mut source: Option<&dyn std::error::Error> = Some(err);
    while let Some(e) = source {
        if let Some(u) = e.downcast_ref::<safehttp::UrlError>() {
            return match u {
                safehttp::UrlError::Blocked(_) | safehttp::UrlError::Scheme => FetchError::Blocked,
                _ => FetchError::Network,
            };
        }
        source = e.source();
    }
    FetchError::Network
}

pub struct ParsedFeed {
    pub title: String,
    pub description: String,
    pub site_url: String,
    pub image_url: String,
    pub etag: String,
    pub last_modified: String,
    pub items: Vec<Item>,
}

/// A feed entry whose GUID is known; the (more expensive) article conversion
/// is deferred until the item is known to be new.
pub struct Item {
    pub guid: String,
    entry: Entry,
}

impl Item {
    pub fn published_at(&self) -> Option<DateTime<Utc>> {
        self.entry.published.or(self.entry.updated)
    }
}

pub struct FeedParser {
    client: reqwest::Client,
}

impl FeedParser {
    pub fn new() -> Self {
        Self {
            client: safehttp::client(Duration::from_secs(30), "FlowReader/2.0 (RSS Reader)"),
        }
    }

    /// Downloads and parses a feed, sending the stored validators so an
    /// unchanged feed costs a 304 instead of a full download and parse.
    pub async fn fetch(&self, feed: &Feed) -> Result<ParsedFeed, FetchError> {
        let url = safehttp::check_url(&feed.url).map_err(|_| FetchError::Blocked)?;
        let mut req = self.client.get(url).header(
            reqwest::header::ACCEPT,
            "application/rss+xml, application/atom+xml, application/feed+json, application/xml;q=0.9, text/xml;q=0.8, */*;q=0.5",
        );
        if let Some(etag) = feed.etag.as_deref().filter(|s| !s.is_empty()) {
            req = req.header(reqwest::header::IF_NONE_MATCH, etag);
        }
        if let Some(lm) = feed.last_modified.as_deref().filter(|s| !s.is_empty()) {
            req = req.header(reqwest::header::IF_MODIFIED_SINCE, lm);
        }
        let resp = req.send().await.map_err(|e| classify(&e))?;
        let status = resp.status();
        if status == reqwest::StatusCode::NOT_MODIFIED {
            return Err(FetchError::NotModified);
        }
        if status != reqwest::StatusCode::OK {
            return Err(FetchError::Status(status.as_u16()));
        }
        let header = |name: reqwest::header::HeaderName, max: usize| {
            resp.headers()
                .get(name)
                .and_then(|v| v.to_str().ok())
                .map(|v| text::truncate_chars(v, max).to_string())
                .unwrap_or_default()
        };
        let etag = header(reqwest::header::ETAG, 512);
        let last_modified = header(reqwest::header::LAST_MODIFIED, 128);
        let body = safehttp::read_limited(resp, MAX_FEED_BYTES)
            .await
            .map_err(|e| {
                if e.to_string().contains("too large") {
                    FetchError::TooLarge
                } else if let Some(re) = e.downcast_ref::<reqwest::Error>() {
                    classify(re)
                } else {
                    FetchError::Network
                }
            })?;
        let base = feed.url.clone();
        let mut parsed = tokio::task::spawn_blocking(move || parse_document(&body, Some(&base)))
            .await
            .map_err(|_| FetchError::Parse)??;
        parsed.etag = etag;
        parsed.last_modified = last_modified;
        Ok(parsed)
    }
}

/// GUID compatible with the previous server: the feed's own id, else the
/// link, else the title; values too long to index are hashed.
fn fallback_id(links: &[Link], title: &Option<feed_rs::model::Text>, _uri: Option<&str>) -> String {
    if let Some(l) = links.first() {
        return l.href.clone();
    }
    title
        .as_ref()
        .map(|t| t.content.clone())
        .unwrap_or_default()
}

fn normalize_guid(raw: &str) -> String {
    let guid = raw.trim();
    if guid.len() > MAX_GUID {
        return format!("sha256:{}", hex::encode(Sha256::digest(guid.as_bytes())));
    }
    guid.to_string()
}

pub fn parse_document(body: &[u8], base: Option<&str>) -> Result<ParsedFeed, FetchError> {
    let parser = feed_rs::parser::Builder::new()
        .sanitize_content(false)
        .base_uri(base)
        .id_generator(fallback_id)
        .build();
    let doc = parser.parse(body).map_err(|_| FetchError::Parse)?;

    let site_url = doc
        .links
        .iter()
        .find(|l| l.rel.as_deref().is_none_or(|r| r == "alternate"))
        .map(|l| http_url(&l.href))
        .unwrap_or_default();
    let image_url = doc
        .logo
        .as_ref()
        .or(doc.icon.as_ref())
        .map(|i| http_url(&i.uri))
        .unwrap_or_default();

    let mut seen = HashSet::new();
    let mut items = Vec::with_capacity(doc.entries.len());
    for entry in doc.entries {
        let guid = normalize_guid(&entry.id);
        if guid.is_empty() || !seen.insert(guid.clone()) {
            continue;
        }
        items.push(Item { guid, entry });
    }

    Ok(ParsedFeed {
        title: text::truncate_chars(
            doc.title
                .as_ref()
                .map(|t| text::plain_text(&t.content))
                .unwrap_or_default()
                .trim(),
            MAX_FEED_TITLE,
        )
        .to_string(),
        description: doc
            .description
            .as_ref()
            .map(|t| text::plain_text(&t.content))
            .unwrap_or_default(),
        site_url,
        image_url,
        etag: String::new(),
        last_modified: String::new(),
        items,
    })
}

/// Converts a feed item into a sanitized article ready to insert.
pub fn to_article(item: &Item, now: DateTime<Utc>) -> NewArticle {
    let e = &item.entry;
    let link = e
        .links
        .iter()
        .find(|l| l.rel.as_deref().is_none_or(|r| r == "alternate"))
        .or(e.links.first())
        .map(|l| http_url(&l.href))
        .unwrap_or_default();
    // Relative URLs in the content are resolved against the article page.
    let base = url::Url::parse(&link).ok();

    let raw_content = e
        .content
        .as_ref()
        .and_then(|c| c.body.as_deref())
        .unwrap_or("");
    let raw_summary = e.summary.as_ref().map(|t| t.content.as_str()).unwrap_or("");
    let content = sanitize::sanitize_with_base(raw_content, base.as_ref());
    let summary = sanitize::sanitize_with_base(raw_summary, base.as_ref());

    let mut plain = text::plain_text(&content);
    if plain.is_empty() {
        plain = text::plain_text(&summary);
    }
    let mut excerpt_src = text::plain_text(&summary);
    if excerpt_src.is_empty() {
        excerpt_src = plain.clone();
    }

    let mut title = e
        .title
        .as_ref()
        .map(|t| text::plain_text(&t.content))
        .unwrap_or_default();
    if title.is_empty() {
        title = text::excerpt(&plain, 80);
    }
    if title.is_empty() {
        title = "(sans titre)".into();
    }

    let author = e.authors.first().map(|p| p.name.trim()).unwrap_or("");
    let author = text::truncate_chars(author, MAX_AUTHOR).to_string();

    let image = find_image(e, raw_content, raw_summary, base.as_ref());

    // Clamp future dates (bad feed clocks) so they don't pin the top of the list.
    let published_at = item.published_at().map(|p| p.min(now));

    NewArticle {
        id: Uuid::new_v4(),
        guid: item.guid.clone(),
        title: text::truncate_chars(&title, MAX_TITLE).to_string(),
        url: non_empty(link),
        content: non_empty(content),
        summary: non_empty(summary),
        excerpt: text::excerpt(&excerpt_src, EXCERPT_CHARS),
        word_count: text::word_count(&plain),
        author: non_empty(author),
        image_url: non_empty(image),
        published_at,
        created_at: now,
    }
}

fn non_empty(s: String) -> Option<String> {
    (!s.is_empty()).then_some(s)
}

/// Keeps only absolute http(s) URLs within the column limit.
pub fn http_url(raw: &str) -> String {
    let raw = raw.trim();
    if raw.is_empty() || raw.len() > MAX_URL {
        return String::new();
    }
    match url::Url::parse(raw) {
        Ok(u) if (u.scheme() == "http" || u.scheme() == "https") && u.host().is_some() => {
            raw.to_string()
        }
        _ => String::new(),
    }
}

static IMG: LazyLock<Selector> = LazyLock::new(|| Selector::parse("img").expect("selector"));

/// Best image for an item: image enclosures / media:content, thumbnails,
/// then the first non-pixel <img> of the content.
fn find_image(e: &Entry, content: &str, summary: &str, base: Option<&url::Url>) -> String {
    let media_contents = || e.media.iter().flat_map(|m| m.content.iter());
    let typed = media_contents().find(|c| {
        c.url.is_some()
            && c.content_type
                .as_ref()
                .is_some_and(|t| t.ty().as_str() == "image")
    });
    if let Some(url) = typed.and_then(|c| c.url.as_ref()) {
        let u = http_url(url.as_str());
        if !u.is_empty() {
            return u;
        }
    }
    for m in &e.media {
        for t in &m.thumbnails {
            let u = http_url(&t.image.uri);
            if !u.is_empty() {
                return u;
            }
        }
    }
    if let Some(url) = media_contents()
        .find(|c| c.content_type.is_none())
        .and_then(|c| c.url.as_ref())
    {
        let u = http_url(url.as_str());
        if !u.is_empty() {
            return u;
        }
    }

    let html = if content.is_empty() { summary } else { content };
    if html.contains("<img") {
        let doc = Html::parse_fragment(html);
        for img in doc.select(&IMG) {
            if img.value().attr("width") == Some("1") {
                continue; // tracking pixel
            }
            if let Some(src) = img.value().attr("src").filter(|s| !s.is_empty()) {
                let resolved = match base {
                    Some(b) => b.join(src).map(|u| u.to_string()).unwrap_or_default(),
                    None => src.to_string(),
                };
                return http_url(&resolved);
            }
        }
    }
    String::new()
}

#[cfg(test)]
mod tests {
    use super::*;

    const RSS: &str = r#"<?xml version="1.0"?>
<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:media="http://search.yahoo.com/mrss/">
<channel><title>Mon &amp; flux</title><link>https://example.org/</link><description>Desc</description>
<item><title>Premier</title><link>https://example.org/1</link><guid>id-1</guid>
<pubDate>Mon, 05 Oct 2026 12:00:00 +0000</pubDate>
<description>&lt;p&gt;Résumé &lt;b&gt;court&lt;/b&gt;&lt;/p&gt;</description>
<content:encoded><![CDATA[<p>Texte <script>x()</script>complet</p><img src="https://example.org/a.jpg">]]></content:encoded>
</item>
<item><title>Sans guid</title><link>https://example.org/2</link>
<pubDate>Tue, 05 Oct 2027 12:00:00 +0000</pubDate>
<enclosure url="https://example.org/b.png" type="image/png" length="1"/></item>
<item><title>Lien seul</title><link>https://example.org/2</link></item>
</channel></rss>"#;

    #[test]
    fn parses_rss_like_the_previous_server() {
        let feed = parse_document(RSS.as_bytes(), None).unwrap();
        assert_eq!(feed.title, "Mon & flux");
        assert_eq!(feed.site_url, "https://example.org/");
        // Duplicate GUIDs (same link) are dropped.
        assert_eq!(feed.items.len(), 2);
        assert_eq!(feed.items[0].guid, "id-1");
        assert_eq!(feed.items[1].guid, "https://example.org/2");

        let now = Utc::now();
        let a = to_article(&feed.items[0], now);
        assert_eq!(a.title, "Premier");
        assert_eq!(a.excerpt, "Résumé court");
        assert!(!a.content.as_deref().unwrap().contains("script"));
        assert_eq!(a.image_url.as_deref(), Some("https://example.org/a.jpg"));
        assert_eq!(a.url.as_deref(), Some("https://example.org/1"));

        let b = to_article(&feed.items[1], now);
        assert_eq!(b.image_url.as_deref(), Some("https://example.org/b.png"));
        // Future publication dates are clamped to the ingest time.
        assert_eq!(b.published_at, Some(now));
    }
}

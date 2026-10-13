//! Extracts the main text of a web page (input for AI summaries).

use std::sync::LazyLock;
use std::time::Duration;

use scraper::{ElementRef, Html, Node, Selector};

use crate::{safehttp, text};

const MAX_PAGE_BYTES: usize = 5 << 20;

static NOISE: LazyLock<Selector> = LazyLock::new(|| {
    Selector::parse("script, style, nav, footer, header, aside, .ads, #comments, .sidebar")
        .expect("selector")
});
static CANDIDATES: LazyLock<Vec<Selector>> = LazyLock::new(|| {
    [
        "article",
        "main",
        ".article-content",
        ".post-content",
        ".entry-content",
        ".content",
        "#main-content",
    ]
    .iter()
    .map(|s| Selector::parse(s).expect("selector"))
    .collect()
});
static BODY: LazyLock<Selector> = LazyLock::new(|| Selector::parse("body").expect("selector"));

pub struct Extractor {
    client: reqwest::Client,
}

impl Extractor {
    pub fn new() -> Self {
        Self {
            client: safehttp::client(
                Duration::from_secs(10),
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            ),
        }
    }

    pub async fn extract(&self, url: &str) -> anyhow::Result<String> {
        let url = safehttp::check_url(url)?;
        let resp = self.client.get(url).send().await?;
        if resp.status() != reqwest::StatusCode::OK {
            anyhow::bail!("unexpected status code: {}", resp.status());
        }
        let body = safehttp::read_limited(resp, MAX_PAGE_BYTES).await?;
        let html = String::from_utf8_lossy(&body).into_owned();
        Ok(tokio::task::spawn_blocking(move || main_text(&html)).await?)
    }
}

/// Text of the best content container, or of the whole body as a fallback.
pub fn main_text(html: &str) -> String {
    let doc = Html::parse_document(html);
    let noise: std::collections::HashSet<_> = doc.select(&NOISE).map(|e| e.id()).collect();

    let text_of = |el: ElementRef<'_>| {
        let mut out = String::new();
        collect(el, &noise, &mut out);
        out
    };

    let mut content = String::new();
    for sel in CANDIDATES.iter() {
        let best = doc
            .select(sel)
            .filter(|e| !noise.contains(&e.id()))
            .map(text_of)
            .max_by_key(|t| t.trim().len());
        if let Some(t) = best {
            content = clean_text(&t);
            if content.len() > 500 {
                break;
            }
        }
    }
    if content.len() < 500 {
        if let Some(body) = doc.select(&BODY).next() {
            content = clean_text(&text_of(body));
        }
    }
    text::truncate_chars(&content, 10_000).to_string()
}

fn collect(
    el: ElementRef<'_>,
    noise: &std::collections::HashSet<ego_tree::NodeId>,
    out: &mut String,
) {
    for child in el.children() {
        match child.value() {
            Node::Text(t) => out.push_str(t),
            Node::Element(_) => {
                if noise.contains(&child.id()) {
                    continue;
                }
                if let Some(e) = ElementRef::wrap(child) {
                    collect(e, noise, out);
                }
            }
            _ => {}
        }
    }
}

fn clean_text(s: &str) -> String {
    s.lines()
        .map(str::trim)
        .filter(|l| !l.is_empty())
        .collect::<Vec<_>>()
        .join("\n")
}

#[cfg(test)]
mod tests {
    #[test]
    fn prefers_article_and_skips_noise() {
        let long = "Lorem ipsum dolor sit amet. ".repeat(30);
        let html = format!(
            "<html><body><nav>Menu</nav><article><h1>Titre</h1><p>{long}</p><aside>Pub</aside></article><footer>Bas</footer></body></html>"
        );
        let t = super::main_text(&html);
        assert!(t.starts_with("Titre"));
        assert!(!t.contains("Menu") && !t.contains("Pub") && !t.contains("Bas"));
    }
}

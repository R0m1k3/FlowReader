//! Plain-text helpers shared by ingest, lists and AI summaries.

use scraper::{Html, Node};

/// Average silent reading speed for non-fiction (Brysbaert, 2019), used to
/// estimate reading time.
pub const WORDS_PER_MINUTE: i32 = 238;

/// Converts an HTML fragment to whitespace-collapsed plain text. Content of
/// script/style/noscript elements is dropped and entities are decoded.
pub fn plain_text(fragment: &str) -> String {
    if fragment.is_empty() {
        return String::new();
    }
    let doc = Html::parse_fragment(fragment);
    let mut out = String::with_capacity(fragment.len() / 2);
    walk(doc.tree.root(), &mut out);
    collapse_spaces(&out)
}

fn walk(node: ego_tree::NodeRef<'_, Node>, out: &mut String) {
    for child in node.children() {
        match child.value() {
            Node::Text(t) => out.push_str(t),
            Node::Element(el) => {
                let name = el.name();
                if matches!(name, "script" | "style" | "noscript") {
                    continue;
                }
                let block = matches!(
                    name,
                    "br" | "p"
                        | "div"
                        | "li"
                        | "h1"
                        | "h2"
                        | "h3"
                        | "h4"
                        | "h5"
                        | "h6"
                        | "blockquote"
                        | "tr"
                        | "td"
                );
                if block {
                    out.push(' ');
                }
                walk(child, out);
                if block {
                    out.push(' ');
                }
            }
            _ => walk(child, out),
        }
    }
}

fn collapse_spaces(s: &str) -> String {
    s.split_whitespace().collect::<Vec<_>>().join(" ")
}

/// Counts whitespace-separated words in plain text.
pub fn word_count(plain: &str) -> i32 {
    plain.split_whitespace().count().min(i32::MAX as usize) as i32
}

/// Converts a word count into a rounded-up reading time (min 1).
pub fn reading_minutes(words: i32) -> i32 {
    if words <= 0 {
        return 1;
    }
    (words + WORDS_PER_MINUTE - 1) / WORDS_PER_MINUTE
}

/// Returns at most `max_chars` characters of plain text, cut on a word
/// boundary when possible and suffixed with an ellipsis when truncated.
pub fn excerpt(plain: &str, max_chars: usize) -> String {
    if plain.chars().count() <= max_chars {
        return plain.to_string();
    }
    let mut cut = truncate_chars(plain, max_chars);
    if let Some(i) = cut.rfind(' ') {
        if i > cut.len() * 2 / 3 {
            cut = &cut[..i];
        }
    }
    let trimmed = cut.trim_end_matches([' ', ',', ';', ':', '.', '-', '–', '—']);
    format!("{trimmed}…")
}

/// Truncates `s` to at most `n` characters without splitting a UTF-8 sequence.
pub fn truncate_chars(s: &str, n: usize) -> &str {
    if n == 0 {
        return "";
    }
    if s.len() <= n {
        return s;
    }
    match s.char_indices().nth(n) {
        Some((pos, _)) => &s[..pos],
        None => s,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn plain_text_drops_scripts_and_decodes_entities() {
        let got = plain_text(
            "<p>Bonjour&nbsp;<b>le</b> monde</p><script>alert(1)</script><p>Fin &amp; suite</p>",
        );
        assert_eq!(got, "Bonjour le monde Fin & suite");
    }

    #[test]
    fn excerpt_cuts_on_word_boundary() {
        let s = "mot ".repeat(100);
        let got = excerpt(&s, 50);
        assert!(got.ends_with('…'));
        assert!(got.chars().count() <= 51);
        assert!(!got.contains("mo…"));
    }

    #[test]
    fn truncate_keeps_utf8_valid() {
        assert_eq!(truncate_chars("éééé", 2), "éé");
    }

    #[test]
    fn reading_minutes_rounds_up() {
        for (words, want) in [(0, 1), (1, 1), (238, 1), (239, 2), (2380, 10)] {
            assert_eq!(reading_minutes(words), want, "words={words}");
        }
    }
}

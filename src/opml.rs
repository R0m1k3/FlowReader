//! OPML import/export.

use quick_xml::events::Event;
use quick_xml::Reader;

#[derive(Debug, Clone, Default)]
pub struct FeedInfo {
    pub url: String,
    pub title: String,
    pub site_url: String,
}

/// Extracts every outline carrying an `xmlUrl`, folders included.
pub fn parse(data: &[u8]) -> anyhow::Result<Vec<FeedInfo>> {
    let mut reader = Reader::from_reader(data);
    reader.config_mut().trim_text(true);
    let mut feeds = Vec::new();
    let mut saw_opml = false;
    let mut buf = Vec::new();
    loop {
        match reader.read_event_into(&mut buf)? {
            Event::Start(e) | Event::Empty(e) => {
                let name = e.local_name();
                if name.as_ref() == b"opml" {
                    saw_opml = true;
                }
                if name.as_ref() != b"outline" {
                    buf.clear();
                    continue;
                }
                let mut info = FeedInfo::default();
                let mut text = String::new();
                for attr in e.attributes().flatten() {
                    let value = attr.unescape_value()?.trim().to_string();
                    match attr.key.local_name().as_ref() {
                        b"xmlUrl" => info.url = value,
                        b"htmlUrl" => info.site_url = value,
                        b"title" => info.title = value,
                        b"text" => text = value,
                        _ => {}
                    }
                }
                if info.title.is_empty() {
                    info.title = text;
                }
                if !info.url.is_empty() {
                    feeds.push(info);
                }
            }
            Event::Eof => break,
            _ => {}
        }
        buf.clear();
    }
    if !saw_opml {
        anyhow::bail!("not an OPML document");
    }
    Ok(feeds)
}

fn escape(s: &str) -> String {
    quick_xml::escape::escape(s).into_owned()
}

/// Creates an OPML 2.0 document from feeds.
pub fn generate(title: &str, feeds: &[FeedInfo]) -> String {
    let mut out =
        String::from("<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<opml version=\"2.0\">\n");
    out.push_str(&format!(
        "  <head>\n    <title>{}</title>\n  </head>\n  <body>\n",
        escape(title)
    ));
    for f in feeds {
        out.push_str(&format!(
            "    <outline text=\"{t}\" title=\"{t}\" type=\"rss\" xmlUrl=\"{u}\" htmlUrl=\"{h}\"/>\n",
            t = escape(&f.title),
            u = escape(&f.url),
            h = escape(&f.site_url),
        ));
    }
    out.push_str("  </body>\n</opml>\n");
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn round_trip_with_folders() {
        let doc = r#"<?xml version="1.0"?><opml version="2.0"><head><title>x</title></head><body>
          <outline text="Tech"><outline text="A &amp; B" xmlUrl="https://a.example/feed" htmlUrl="https://a.example/"/></outline>
          <outline title="C" xmlUrl="https://c.example/rss"></outline></body></opml>"#;
        let feeds = parse(doc.as_bytes()).unwrap();
        assert_eq!(feeds.len(), 2);
        assert_eq!(feeds[0].title, "A & B");
        assert_eq!(feeds[1].url, "https://c.example/rss");
        let again = parse(generate("FlowReader Feeds", &feeds).as_bytes()).unwrap();
        assert_eq!(again.len(), 2);
        assert_eq!(again[0].title, "A & B");
        assert!(parse(b"<html></html>").is_err());
    }
}

// Package parser provides RSS/Atom feed parsing functionality.
package parser

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/PuerkitoBio/goquery"
	"github.com/google/uuid"
	"github.com/michael/flowreader/internal/domain"
	"github.com/michael/flowreader/internal/utils"
	"github.com/mmcdole/gofeed"
)

// ErrNotModified is returned when the server answered 304 to a conditional GET.
var ErrNotModified = errors.New("feed not modified")

// maxFeedBytes bounds how much of a feed document is read.
const maxFeedBytes = 10 << 20

// Column limits from the schema (VARCHAR sizes); values are truncated on a
// rune boundary so one oversized item can't abort the whole batch insert.
const (
	maxTitle     = 1024
	maxFeedTitle = 512
	maxAuthor    = 256
	maxURL       = 2048
	maxGUID      = 512 // longer GUIDs are hashed
	excerptRunes = 320
)

// FeedParser handles RSS/Atom feed parsing.
type FeedParser struct {
	client    *http.Client
	parser    *gofeed.Parser
	sanitizer *utils.ContentSanitizer
}

// NewFeedParser creates a new feed parser.
func NewFeedParser() *FeedParser {
	return &FeedParser{
		// SSRF-hardened client: refuses to connect to private/internal addresses.
		client:    utils.SafeHTTPClient(30 * time.Second),
		parser:    gofeed.NewParser(),
		sanitizer: utils.NewContentSanitizer(),
	}
}

// ParsedFeed contains the parsed feed data.
type ParsedFeed struct {
	Title        string
	Description  string
	SiteURL      string
	ImageURL     string
	ETag         string
	LastModified string
	Items        []*Item
}

// Item is a feed entry whose GUID is known; the (more expensive) article
// conversion is deferred until the item is known to be new.
type Item struct {
	GUID string
	raw  *gofeed.Item
}

// Parse fetches and parses a feed, sending the stored validators so an
// unchanged feed costs a 304 instead of a full download and parse.
func (p *FeedParser) Parse(ctx context.Context, feed *domain.Feed) (*ParsedFeed, error) {
	// Validate up-front (scheme + non-private host) before issuing the request.
	if _, err := utils.ValidateExternalURL(feed.URL); err != nil {
		return nil, err
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, feed.URL, nil)
	if err != nil {
		return nil, fmt.Errorf("creating request: %w", err)
	}
	req.Header.Set("User-Agent", "FlowReader/1.0 (RSS Reader)")
	req.Header.Set("Accept", "application/rss+xml, application/atom+xml, application/xml;q=0.9, text/xml;q=0.8, */*;q=0.5")
	if feed.ETag != "" {
		req.Header.Set("If-None-Match", feed.ETag)
	}
	if feed.LastModified != "" {
		req.Header.Set("If-Modified-Since", feed.LastModified)
	}

	resp, err := p.client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("fetching feed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusNotModified {
		return nil, ErrNotModified
	}
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("unexpected status code: %d", resp.StatusCode)
	}
	if resp.ContentLength > maxFeedBytes {
		return nil, fmt.Errorf("feed too large")
	}

	parsedDoc, err := p.parser.Parse(io.LimitReader(resp.Body, maxFeedBytes))
	if err != nil {
		return nil, fmt.Errorf("parsing feed: %w", err)
	}

	parsed := &ParsedFeed{
		Title:        utils.TruncateRunes(strings.TrimSpace(parsedDoc.Title), maxFeedTitle),
		Description:  utils.PlainText(parsedDoc.Description),
		SiteURL:      httpURL(parsedDoc.Link),
		ETag:         utils.TruncateRunes(resp.Header.Get("ETag"), 512),
		LastModified: utils.TruncateRunes(resp.Header.Get("Last-Modified"), 128),
	}
	if parsedDoc.Image != nil {
		parsed.ImageURL = httpURL(parsedDoc.Image.URL)
	}

	seen := make(map[string]struct{}, len(parsedDoc.Items))
	for _, item := range parsedDoc.Items {
		guid := getGUID(item)
		if guid == "" {
			continue
		}
		if _, dup := seen[guid]; dup {
			continue
		}
		seen[guid] = struct{}{}
		parsed.Items = append(parsed.Items, &Item{GUID: guid, raw: item})
	}

	return parsed, nil
}

// ToArticle converts a feed item into a sanitized article ready to insert.
func (p *FeedParser) ToArticle(it *Item, feedID uuid.UUID, now time.Time) *domain.Article {
	item := it.raw
	content := p.sanitizer.Sanitize(item.Content)
	summary := p.sanitizer.Sanitize(item.Description)

	plain := utils.PlainText(content)
	if plain == "" {
		plain = utils.PlainText(summary)
	}
	excerptSrc := utils.PlainText(summary)
	if excerptSrc == "" {
		excerptSrc = plain
	}

	title := strings.TrimSpace(utils.PlainText(item.Title))
	if title == "" {
		title = utils.Excerpt(plain, 80)
	}
	if title == "" {
		title = "(sans titre)"
	}

	article := &domain.Article{
		ID:        uuid.New(),
		FeedID:    feedID,
		GUID:      it.GUID,
		Title:     utils.TruncateRunes(title, maxTitle),
		URL:       httpURL(item.Link),
		Content:   content,
		Summary:   summary,
		Excerpt:   utils.Excerpt(excerptSrc, excerptRunes),
		WordCount: utils.WordCount(plain),
		CreatedAt: now,
	}

	if item.Author != nil {
		article.Author = item.Author.Name
	} else if len(item.Authors) > 0 && item.Authors[0] != nil {
		article.Author = item.Authors[0].Name
	}
	article.Author = utils.TruncateRunes(strings.TrimSpace(article.Author), maxAuthor)

	if item.Image != nil && item.Image.URL != "" {
		article.ImageURL = httpURL(item.Image.URL)
	}
	if article.ImageURL == "" {
		article.ImageURL = httpURL(findImage(item))
	}

	if item.PublishedParsed != nil {
		article.PublishedAt = item.PublishedParsed
	} else if item.UpdatedParsed != nil {
		article.PublishedAt = item.UpdatedParsed
	}
	// Clamp future dates (bad feed clocks) so they don't pin the top of the list.
	if article.PublishedAt != nil && article.PublishedAt.After(now) {
		t := now
		article.PublishedAt = &t
	}

	return article
}

// PublishedAt returns the item's publication date, if any.
func (it *Item) PublishedAt() *time.Time {
	if it.raw.PublishedParsed != nil {
		return it.raw.PublishedParsed
	}
	return it.raw.UpdatedParsed
}

// httpURL keeps only absolute http(s) URLs within the column limit.
func httpURL(raw string) string {
	raw = strings.TrimSpace(raw)
	if raw == "" || len(raw) > maxURL {
		return ""
	}
	u, err := url.Parse(raw)
	if err != nil || (u.Scheme != "http" && u.Scheme != "https") || u.Host == "" {
		return ""
	}
	return raw
}

// getGUID returns a unique identifier for the feed item, hashing values too
// long to index.
func getGUID(item *gofeed.Item) string {
	guid := item.GUID
	if guid == "" {
		guid = item.Link
	}
	if guid == "" {
		guid = item.Title // Last resort fallback
	}
	guid = strings.TrimSpace(guid)
	if len(guid) > maxGUID {
		sum := sha256.Sum256([]byte(guid))
		return "sha256:" + hex.EncodeToString(sum[:])
	}
	return guid
}

// findImage attempts to find the best image for a feed item.
func findImage(item *gofeed.Item) string {
	// 1. Check Enclosures
	for _, enc := range item.Enclosures {
		if strings.HasPrefix(enc.Type, "image/") {
			return enc.URL
		}
	}

	// 2. Check Media Extensions (media:content, media:thumbnail)
	if media, ok := item.Extensions["media"]; ok {
		if content, ok := media["content"]; ok && len(content) > 0 {
			if url := content[0].Attrs["url"]; url != "" {
				return url
			}
		}
		if thumbnail, ok := media["thumbnail"]; ok && len(thumbnail) > 0 {
			if url := thumbnail[0].Attrs["url"]; url != "" {
				return url
			}
		}
	}

	// 3. Extract from Content/Description as fallback
	htmlContent := item.Content
	if htmlContent == "" {
		htmlContent = item.Description
	}

	if htmlContent != "" && strings.Contains(htmlContent, "<img") {
		doc, err := goquery.NewDocumentFromReader(strings.NewReader(htmlContent))
		if err == nil {
			var found string
			doc.Find("img").EachWithBreak(func(_ int, s *goquery.Selection) bool {
				src, _ := s.Attr("src")
				// Skip tracking pixels.
				if w, _ := s.Attr("width"); w == "1" {
					return true
				}
				found = src
				return src == ""
			})
			return found
		}
	}

	return ""
}

// Package parser provides RSS/Atom feed parsing functionality.
package parser

import (
	"context"
	"fmt"
	"net/http"
	"time"

	"strings"

	"github.com/PuerkitoBio/goquery"
	"github.com/google/uuid"
	"github.com/michael/flowreader/internal/domain"
	"github.com/mmcdole/gofeed"
)

// FeedParser handles RSS/Atom feed parsing.
type FeedParser struct {
	client *http.Client
	parser *gofeed.Parser
}

// NewFeedParser creates a new feed parser.
func NewFeedParser() *FeedParser {
	client := &http.Client{
		Timeout: 30 * time.Second,
	}

	return &FeedParser{
		client: client,
		parser: gofeed.NewParser(),
	}
}

// ParsedFeed contains the parsed feed data.
type ParsedFeed struct {
	Title       string
	Description string
	SiteURL     string
	ImageURL    string
	Articles    []*domain.Article
}

// Parse fetches and parses a feed URL.
func (p *FeedParser) Parse(ctx context.Context, feedURL string, feedID uuid.UUID) (*ParsedFeed, error) {
	// Create request with context
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, feedURL, nil)
	if err != nil {
		return nil, fmt.Errorf("creating request: %w", err)
	}
	req.Header.Set("User-Agent", "FlowReader/1.0 (RSS Reader)")

	// Fetch the feed
	resp, err := p.client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("fetching feed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("unexpected status code: %d", resp.StatusCode)
	}

	// Parse the feed
	feed, err := p.parser.Parse(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("parsing feed: %w", err)
	}

	// Extract metadata
	parsed := &ParsedFeed{
		Title:       feed.Title,
		Description: feed.Description,
	}

	if feed.Link != "" {
		parsed.SiteURL = feed.Link
	}

	if feed.Image != nil && feed.Image.URL != "" {
		parsed.ImageURL = feed.Image.URL
	}

	// Convert items to articles
	for _, item := range feed.Items {
		article := &domain.Article{
			ID:     uuid.New(),
			FeedID: feedID,
			GUID:   getGUID(item),
			Title:  item.Title,
		}

		if item.Link != "" {
			article.URL = item.Link
		}

		if item.Content != "" {
			article.Content = item.Content
		}

		if item.Description != "" {
			article.Summary = item.Description
		}

		if item.Author != nil {
			article.Author = item.Author.Name
		} else if len(item.Authors) > 0 {
			article.Author = item.Authors[0].Name
		}

		if item.Image != nil && item.Image.URL != "" {
			article.ImageURL = item.Image.URL
		} else {
			article.ImageURL = findImage(item)
		}

		if item.PublishedParsed != nil {
			article.PublishedAt = item.PublishedParsed
		} else if item.UpdatedParsed != nil {
			article.PublishedAt = item.UpdatedParsed
		}

		article.CreatedAt = time.Now()

		parsed.Articles = append(parsed.Articles, article)
	}

	return parsed, nil
}

// getGUID returns a unique identifier for the feed item.
func getGUID(item *gofeed.Item) string {
	if item.GUID != "" {
		return item.GUID
	}
	if item.Link != "" {
		return item.Link
	}
	return item.Title // Last resort fallback
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

	if htmlContent != "" {
		doc, err := goquery.NewDocumentFromReader(strings.NewReader(htmlContent))
		if err == nil {
			if imgURL, exists := doc.Find("img").First().Attr("src"); exists {
				return imgURL
			}
		}
	}

	return ""
}

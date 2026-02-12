package utils

import (
	"context"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/PuerkitoBio/goquery"
)

// ContentExtractor extracts the main text content from a web page.
type ContentExtractor struct {
	client *http.Client
}

// NewContentExtractor creates a new extractor instance.
func NewContentExtractor() *ContentExtractor {
	return &ContentExtractor{
		client: &http.Client{
			Timeout: 10 * time.Second,
		},
	}
}

// Extract fetches the URL and tries to extract the main article content.
func (e *ContentExtractor) Extract(ctx context.Context, url string) (string, error) {
	if url == "" {
		return "", fmt.Errorf("empty URL")
	}

	req, err := http.NewRequestWithContext(ctx, "GET", url, nil)
	if err != nil {
		return "", err
	}

	// Set a common User-Agent to avoid some basic bot detection
	req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")

	resp, err := e.client.Do(req)
	if err != nil {
		return "", fmt.Errorf("fetching URL: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("unexpected status code: %d", resp.StatusCode)
	}

	doc, err := goquery.NewDocumentFromReader(resp.Body)
	if err != nil {
		return "", fmt.Errorf("parsing HTML: %w", err)
	}

	// 1. Remove noise
	doc.Find("script, style, nav, footer, header, aside, .ads, #comments, .sidebar").Remove()

	// 2. Try to find the main content container
	var content string

	// Priority list of selectors for article content
	selectors := []string{
		"article",
		"main",
		".article-content",
		".post-content",
		".entry-content",
		".content",
		"#main-content",
	}

	for _, selector := range selectors {
		selection := doc.Find(selector)
		if selection.Length() > 0 {
			// Get the longest piece of text if multiple matches
			maxLength := 0
			var bestSelection *goquery.Selection
			selection.Each(func(i int, s *goquery.Selection) {
				textLen := len(strings.TrimSpace(s.Text()))
				if textLen > maxLength {
					maxLength = textLen
					bestSelection = s
				}
			})
			if bestSelection != nil {
				content = e.cleanText(bestSelection.Text())
				if len(content) > 500 { // Heuristic: good enough
					break
				}
			}
		}
	}

	// 3. Fallback: Body text if no container found or text too short
	if len(content) < 500 {
		content = e.cleanText(doc.Find("body").Text())
	}

	// Limit to 10000 characters to avoid huge payloads to AI
	if len(content) > 10000 {
		content = content[:10000]
	}

	return content, nil
}

func (e *ContentExtractor) cleanText(text string) string {
	lines := strings.Split(text, "\n")
	var cleaned []string
	for _, line := range lines {
		trimmed := strings.TrimSpace(line)
		if trimmed != "" {
			cleaned = append(cleaned, trimmed)
		}
	}
	return strings.Join(cleaned, "\n")
}

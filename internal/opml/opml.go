// Package opml provides OPML file parsing for feed import/export.
package opml

import (
	"encoding/xml"
	"fmt"
	"io"
	"strings"
)

// OPML represents the root OPML document.
type OPML struct {
	XMLName xml.Name `xml:"opml"`
	Version string   `xml:"version,attr"`
	Head    Head     `xml:"head"`
	Body    Body     `xml:"body"`
}

// Head contains OPML metadata.
type Head struct {
	Title       string `xml:"title"`
	DateCreated string `xml:"dateCreated,omitempty"`
}

// Body contains the outline elements.
type Body struct {
	Outlines []Outline `xml:"outline"`
}

// Outline represents an OPML outline element (feed or folder).
type Outline struct {
	Text        string    `xml:"text,attr"`
	Title       string    `xml:"title,attr"`
	Type        string    `xml:"type,attr"`
	XMLURL      string    `xml:"xmlUrl,attr"`
	HTMLURL     string    `xml:"htmlUrl,attr"`
	Description string    `xml:"description,attr"`
	Category    string    `xml:"category,attr"`
	Outlines    []Outline `xml:"outline"` // Nested outlines (folders)
}

// FeedInfo contains extracted feed information.
type FeedInfo struct {
	URL         string
	Title       string
	SiteURL     string
	Description string
	Category    string
}

// Parse reads an OPML file and extracts feed information.
func Parse(r io.Reader) ([]FeedInfo, error) {
	data, err := io.ReadAll(r)
	if err != nil {
		return nil, fmt.Errorf("reading OPML: %w", err)
	}

	var opml OPML
	if err := xml.Unmarshal(data, &opml); err != nil {
		return nil, fmt.Errorf("parsing OPML: %w", err)
	}

	var feeds []FeedInfo
	extractFeeds(opml.Body.Outlines, "", &feeds)

	return feeds, nil
}

// extractFeeds recursively extracts feeds from outlines.
func extractFeeds(outlines []Outline, category string, feeds *[]FeedInfo) {
	for _, outline := range outlines {
		// If it has nested outlines, it's a folder
		if len(outline.Outlines) > 0 {
			folderName := outline.Text
			if folderName == "" {
				folderName = outline.Title
			}
			extractFeeds(outline.Outlines, folderName, feeds)
			continue
		}

		// If it has an XML URL, it's a feed
		if outline.XMLURL != "" {
			title := outline.Title
			if title == "" {
				title = outline.Text
			}

			cat := category
			if outline.Category != "" {
				cat = outline.Category
			}

			*feeds = append(*feeds, FeedInfo{
				URL:         strings.TrimSpace(outline.XMLURL),
				Title:       strings.TrimSpace(title),
				SiteURL:     strings.TrimSpace(outline.HTMLURL),
				Description: strings.TrimSpace(outline.Description),
				Category:    strings.TrimSpace(cat),
			})
		}
	}
}

// Generate creates an OPML document from feeds.
func Generate(title string, feeds []FeedInfo) ([]byte, error) {
	opml := OPML{
		Version: "2.0",
		Head: Head{
			Title: title,
		},
	}

	for _, feed := range feeds {
		opml.Body.Outlines = append(opml.Body.Outlines, Outline{
			Text:    feed.Title,
			Title:   feed.Title,
			Type:    "rss",
			XMLURL:  feed.URL,
			HTMLURL: feed.SiteURL,
		})
	}

	output, err := xml.MarshalIndent(opml, "", "  ")
	if err != nil {
		return nil, fmt.Errorf("generating OPML: %w", err)
	}

	return append([]byte(xml.Header), output...), nil
}

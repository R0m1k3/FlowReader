// Package utils provides common utility functions.
package utils

import (
	"github.com/microcosm-cc/bluemonday"
)

// ContentSanitizer handles HTML sanitization for articles.
// A bluemonday policy is safe for concurrent use once built.
type ContentSanitizer struct {
	policy *bluemonday.Policy
}

// NewContentSanitizer creates a new sanitizer with a "UGCPolicy" (safe for user-generated content).
func NewContentSanitizer() *ContentSanitizer {
	// UGCPolicy allows common tags (b, i, p, img, figure, table…) but strips
	// scripts, styles, event handlers and non-http(s)/mailto links.
	policy := bluemonday.UGCPolicy()
	// Article links open in a new tab instead of navigating away from the
	// reader (rel="noopener noreferrer nofollow" is added automatically).
	policy.AddTargetBlankToFullyQualifiedLinks(true)
	policy.RequireNoReferrerOnFullyQualifiedLinks(true)
	return &ContentSanitizer{policy: policy}
}

// Sanitize cleans the HTML content.
func (s *ContentSanitizer) Sanitize(html string) string {
	if html == "" {
		return ""
	}
	return s.policy.Sanitize(html)
}

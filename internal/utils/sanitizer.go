// Package utils provides common utility functions.
package utils

import (
	"github.com/microcosm-cc/bluemonday"
)

// ContentSanitizer handles HTML sanitization for articles.
type ContentSanitizer struct {
	policy *bluemonday.Policy
}

// NewContentSanitizer creates a new sanitizer with a "UGCPolicy" (safe for user-generated content).
func NewContentSanitizer() *ContentSanitizer {
	// Using UGCPolicy allows common tags (b, i, p, img, etc.) but strips dangerous ones.
	return &ContentSanitizer{
		policy: bluemonday.UGCPolicy(),
	}
}

// Sanitize cleans the HTML content.
func (s *ContentSanitizer) Sanitize(html string) string {
	if html == "" {
		return ""
	}
	return s.policy.Sanitize(html)
}

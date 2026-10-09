package utils

import (
	"strings"
	"unicode"
	"unicode/utf8"

	"golang.org/x/net/html"
)

// WordsPerMinute is the average silent reading speed for non-fiction
// (Brysbaert, 2019) used to estimate reading time.
const WordsPerMinute = 238

// PlainText converts an HTML fragment to whitespace-collapsed plain text.
// Content of script/style/noscript elements is dropped and entities are decoded.
func PlainText(fragment string) string {
	if fragment == "" {
		return ""
	}
	var b strings.Builder
	b.Grow(len(fragment) / 2)
	z := html.NewTokenizer(strings.NewReader(fragment))
	skip := 0
	for {
		switch z.Next() {
		case html.ErrorToken:
			return collapseSpaces(b.String())
		case html.StartTagToken:
			name, _ := z.TagName()
			switch string(name) {
			case "script", "style", "noscript":
				skip++
			case "br", "p", "div", "li", "h1", "h2", "h3", "h4", "h5", "h6", "blockquote", "tr":
				b.WriteByte(' ')
			}
		case html.EndTagToken:
			name, _ := z.TagName()
			switch string(name) {
			case "script", "style", "noscript":
				if skip > 0 {
					skip--
				}
			case "p", "div", "li", "h1", "h2", "h3", "h4", "h5", "h6", "blockquote", "tr", "td":
				b.WriteByte(' ')
			}
		case html.TextToken:
			if skip == 0 {
				b.Write(z.Text())
			}
		}
	}
}

func collapseSpaces(s string) string {
	var b strings.Builder
	b.Grow(len(s))
	space := false
	for _, r := range s {
		if unicode.IsSpace(r) {
			space = true
			continue
		}
		if space && b.Len() > 0 {
			b.WriteByte(' ')
		}
		space = false
		b.WriteRune(r)
	}
	return b.String()
}

// WordCount counts whitespace-separated words in plain text.
func WordCount(plain string) int {
	return len(strings.Fields(plain))
}

// ReadingMinutes converts a word count into a rounded-up reading time (min 1).
func ReadingMinutes(words int) int {
	if words <= 0 {
		return 1
	}
	return (words + WordsPerMinute - 1) / WordsPerMinute
}

// Excerpt returns at most maxRunes runes of plain text, cut on a word
// boundary when possible and suffixed with an ellipsis when truncated.
func Excerpt(plain string, maxRunes int) string {
	if utf8.RuneCountInString(plain) <= maxRunes {
		return plain
	}
	cut := TruncateRunes(plain, maxRunes)
	if i := strings.LastIndexByte(cut, ' '); i > len(cut)*2/3 {
		cut = cut[:i]
	}
	return strings.TrimRight(cut, " ,;:.-–—") + "…"
}

// TruncateRunes truncates s to at most n runes without splitting a UTF-8
// sequence.
func TruncateRunes(s string, n int) string {
	if n <= 0 {
		return ""
	}
	if len(s) <= n {
		return s
	}
	i := 0
	for pos := range s {
		if i == n {
			return s[:pos]
		}
		i++
	}
	return s
}

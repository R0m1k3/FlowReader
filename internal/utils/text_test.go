package utils

import (
	"net"
	"strings"
	"testing"
	"unicode/utf8"
)

func TestPlainText(t *testing.T) {
	got := PlainText(`<p>Bonjour&nbsp;<b>le</b> monde</p><script>alert(1)</script><p>Fin &amp; suite</p>`)
	want := "Bonjour le monde Fin & suite"
	if got != want {
		t.Fatalf("PlainText = %q, want %q", got, want)
	}
}

func TestExcerptCutsOnWordBoundary(t *testing.T) {
	s := strings.Repeat("mot ", 100)
	got := Excerpt(s, 50)
	if !strings.HasSuffix(got, "…") || utf8.RuneCountInString(got) > 51 {
		t.Fatalf("unexpected excerpt %q", got)
	}
	if strings.Contains(got, "mo…") {
		t.Fatalf("excerpt split a word: %q", got)
	}
}

func TestTruncateRunesKeepsUTF8Valid(t *testing.T) {
	got := TruncateRunes("éééé", 2)
	if got != "éé" || !utf8.ValidString(got) {
		t.Fatalf("TruncateRunes = %q", got)
	}
}

func TestReadingMinutes(t *testing.T) {
	cases := map[int]int{0: 1, 1: 1, 238: 1, 239: 2, 2380: 10}
	for words, want := range cases {
		if got := ReadingMinutes(words); got != want {
			t.Errorf("ReadingMinutes(%d) = %d, want %d", words, got, want)
		}
	}
}

func TestIsDisallowedIP(t *testing.T) {
	blocked := []string{"127.0.0.1", "10.1.2.3", "192.168.1.1", "169.254.169.254", "::1",
		"64:ff9b::a00:1", "2002:a00:1::1", "198.18.0.1", "100.64.0.1", "::ffff:127.0.0.1"}
	for _, s := range blocked {
		if !isDisallowedIP(net.ParseIP(s)) {
			t.Errorf("%s should be blocked", s)
		}
	}
	for _, s := range []string{"1.1.1.1", "2606:4700:4700::1111"} {
		if isDisallowedIP(net.ParseIP(s)) {
			t.Errorf("%s should be allowed", s)
		}
	}
}

package handler

import (
	"net/http/httptest"
	"testing"
)

func TestGetClientIPIgnoresSpoofedHeadersWithoutTrustedProxy(t *testing.T) {
	trustedProxies = nil
	r := httptest.NewRequest("POST", "/api/v1/auth/login", nil)
	r.RemoteAddr = "203.0.113.7:5555"
	r.Header.Set("X-Forwarded-For", "1.2.3.4")
	if got := getClientIP(r); got != "203.0.113.7" {
		t.Fatalf("got %q, want peer address", got)
	}
}

func TestGetClientIPUsesRightmostUntrustedHop(t *testing.T) {
	trustedProxies = parsePrefixes("10.0.0.0/8")
	defer func() { trustedProxies = nil }()
	r := httptest.NewRequest("POST", "/", nil)
	r.RemoteAddr = "10.0.0.2:443"
	r.Header.Set("X-Forwarded-For", "6.6.6.6, 198.51.100.9, 10.0.0.3")
	if got := getClientIP(r); got != "198.51.100.9" {
		t.Fatalf("got %q, want 198.51.100.9", got)
	}
}

func TestSameOriginGuard(t *testing.T) {
	h := SameOriginGuard(nil)
	r := httptest.NewRequest("POST", "http://reader.example/api/v1/articles/read-all", nil)
	r.Header.Set("Sec-Fetch-Site", "cross-site")
	w := httptest.NewRecorder()
	h.ServeHTTP(w, r)
	if w.Code != 403 {
		t.Fatalf("cross-site POST got %d, want 403", w.Code)
	}
}

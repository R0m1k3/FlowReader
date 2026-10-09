package handler

import (
	"context"
	"net"
	"net/http"
	"net/netip"
	"net/url"
	"os"
	"strings"

	"github.com/michael/flowreader/internal/domain"
	"github.com/michael/flowreader/internal/service"
)

type ctxKey int

const userCtxKey ctxKey = iota

// RequireAuth resolves the session cookie once per request (one SQL query)
// and stores the user in the request context. Unauthenticated requests get 401.
func RequireAuth(authService *service.AuthService) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			cookie, err := r.Cookie("session_id")
			if err != nil || cookie.Value == "" {
				respondError(w, http.StatusUnauthorized, "Not authenticated")
				return
			}
			user, err := authService.GetUserByTokenCtx(r.Context(), cookie.Value)
			if err != nil {
				respondError(w, http.StatusInternalServerError, "Failed to resolve session")
				return
			}
			if user == nil {
				respondError(w, http.StatusUnauthorized, "Session expired")
				return
			}
			next.ServeHTTP(w, r.WithContext(context.WithValue(r.Context(), userCtxKey, user)))
		})
	}
}

// currentUser returns the user set by RequireAuth. It is only nil for routes
// not wrapped by RequireAuth.
func currentUser(r *http.Request) *domain.User {
	u, _ := r.Context().Value(userCtxKey).(*domain.User)
	return u
}

// trustedProxies lists CIDRs (TRUSTED_PROXIES, comma-separated) whose
// X-Forwarded-For header is believed. Empty means: trust no proxy header.
var trustedProxies = parsePrefixes(os.Getenv("TRUSTED_PROXIES"))

func parsePrefixes(raw string) []netip.Prefix {
	var out []netip.Prefix
	for _, s := range strings.Split(raw, ",") {
		s = strings.TrimSpace(s)
		if s == "" {
			continue
		}
		if !strings.Contains(s, "/") {
			if a, err := netip.ParseAddr(s); err == nil {
				out = append(out, netip.PrefixFrom(a, a.BitLen()))
			}
			continue
		}
		if p, err := netip.ParsePrefix(s); err == nil {
			out = append(out, p.Masked())
		}
	}
	return out
}

func isTrustedProxy(a netip.Addr) bool {
	a = a.Unmap()
	for _, p := range trustedProxies {
		if p.Contains(a) {
			return true
		}
	}
	return false
}

// getClientIP returns the peer address, honouring X-Forwarded-For only when
// the direct peer is a configured trusted proxy. The right-most untrusted
// entry is used, which a client cannot spoof.
func getClientIP(r *http.Request) string {
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		host = r.RemoteAddr
	}
	peer, err := netip.ParseAddr(host)
	if err != nil || !isTrustedProxy(peer) {
		return host
	}
	hops := strings.Split(r.Header.Get("X-Forwarded-For"), ",")
	for i := len(hops) - 1; i >= 0; i-- {
		hop := strings.TrimSpace(hops[i])
		a, err := netip.ParseAddr(hop)
		if err != nil {
			break
		}
		if !isTrustedProxy(a) {
			return a.Unmap().String()
		}
	}
	return host
}

// SecurityHeaders sets defensive response headers, including a CSP that
// backstops the HTML sanitizer for feed content.
func SecurityHeaders(next http.Handler) http.Handler {
	const csp = "default-src 'self'; " +
		"script-src 'self'; " +
		"style-src 'self' 'unsafe-inline'; " +
		"img-src * data: blob:; " +
		"media-src *; " +
		"font-src 'self' data:; " +
		"connect-src 'self'; " +
		"frame-src 'none'; object-src 'none'; base-uri 'none'; " +
		"frame-ancestors 'none'; form-action 'self'; manifest-src 'self'; worker-src 'self'"
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		h := w.Header()
		h.Set("X-Content-Type-Options", "nosniff")
		h.Set("X-Frame-Options", "DENY")
		h.Set("Referrer-Policy", "strict-origin-when-cross-origin")
		h.Set("Permissions-Policy", "geolocation=(), microphone=(), camera=()")
		h.Set("Content-Security-Policy", csp)
		h.Set("Cross-Origin-Opener-Policy", "same-origin")
		if secureCookie(r) {
			h.Set("Strict-Transport-Security", "max-age=31536000")
		}
		next.ServeHTTP(w, r)
	})
}

// LimitBody caps request bodies to n bytes.
func LimitBody(n int64) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if r.Body != nil {
				r.Body = http.MaxBytesReader(w, r.Body, n)
			}
			next.ServeHTTP(w, r)
		})
	}
}

// SameOriginGuard rejects state-changing requests coming from another site
// (CSRF defence in depth on top of SameSite=Strict cookies).
func SameOriginGuard(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodGet, http.MethodHead, http.MethodOptions:
			next.ServeHTTP(w, r)
			return
		}
		if site := r.Header.Get("Sec-Fetch-Site"); site != "" {
			if site != "same-origin" && site != "none" {
				respondError(w, http.StatusForbidden, "Cross-site request blocked")
				return
			}
		} else if origin := r.Header.Get("Origin"); origin != "" {
			u, err := url.Parse(origin)
			if err != nil || !strings.EqualFold(u.Host, r.Host) {
				respondError(w, http.StatusForbidden, "Cross-site request blocked")
				return
			}
		}
		next.ServeHTTP(w, r)
	})
}

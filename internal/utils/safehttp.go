package utils

import (
	"context"
	"fmt"
	"net"
	"net/http"
	"net/url"
	"strings"
	"syscall"
	"time"
)

// ErrBlockedHost is returned when a URL resolves to a non-public address.
type ErrBlockedHost struct{ Host string }

func (e *ErrBlockedHost) Error() string {
	return fmt.Sprintf("blocked request to non-public host: %s", e.Host)
}

// isDisallowedIP reports whether an IP is private, loopback, link-local,
// unspecified, or otherwise unsafe to fetch (SSRF protection).
func isDisallowedIP(ip net.IP) bool {
	if ip == nil {
		return true
	}
	if ip.IsLoopback() || ip.IsPrivate() || ip.IsUnspecified() ||
		ip.IsLinkLocalUnicast() || ip.IsLinkLocalMulticast() || ip.IsMulticast() {
		return true
	}
	// Block IPv4-mapped cloud metadata endpoint explicitly (169.254.169.254 is
	// already link-local, but keep an explicit guard for clarity/IPv6 forms).
	if v4 := ip.To4(); v4 != nil {
		// 0.0.0.0/8 and 100.64.0.0/10 (CGNAT) are also unsafe targets.
		if v4[0] == 0 {
			return true
		}
		if v4[0] == 100 && v4[1]&0xC0 == 64 {
			return true
		}
	}
	return false
}

// ValidateExternalURL parses raw, enforces http(s), and verifies that the host
// does not resolve to any disallowed (private/internal) address. It returns the
// parsed URL so callers can reuse the normalized form.
func ValidateExternalURL(raw string) (*url.URL, error) {
	u, err := url.Parse(strings.TrimSpace(raw))
	if err != nil {
		return nil, fmt.Errorf("invalid URL: %w", err)
	}
	if u.Scheme != "http" && u.Scheme != "https" {
		return nil, fmt.Errorf("unsupported scheme %q", u.Scheme)
	}
	host := u.Hostname()
	if host == "" {
		return nil, fmt.Errorf("missing host")
	}

	// If the host is a literal IP, validate it directly.
	if ip := net.ParseIP(host); ip != nil {
		if isDisallowedIP(ip) {
			return nil, &ErrBlockedHost{Host: host}
		}
		return u, nil
	}

	// Otherwise resolve and validate every returned address.
	ips, err := net.DefaultResolver.LookupIPAddr(context.Background(), host)
	if err != nil {
		return nil, fmt.Errorf("resolving host: %w", err)
	}
	if len(ips) == 0 {
		return nil, &ErrBlockedHost{Host: host}
	}
	for _, addr := range ips {
		if isDisallowedIP(addr.IP) {
			return nil, &ErrBlockedHost{Host: host}
		}
	}
	return u, nil
}

// SafeHTTPClient returns an *http.Client hardened against SSRF. A dial-time
// Control hook re-validates the resolved IP for every connection, which also
// defeats DNS-rebinding (TOCTOU) attacks that pass the up-front check.
func SafeHTTPClient(timeout time.Duration) *http.Client {
	dialer := &net.Dialer{
		Timeout:   10 * time.Second,
		KeepAlive: 30 * time.Second,
		Control: func(_, address string, _ syscall.RawConn) error {
			host, _, err := net.SplitHostPort(address)
			if err != nil {
				return err
			}
			ip := net.ParseIP(host)
			if isDisallowedIP(ip) {
				return &ErrBlockedHost{Host: host}
			}
			return nil
		},
	}

	transport := &http.Transport{
		DialContext:           dialer.DialContext,
		ForceAttemptHTTP2:     true,
		MaxIdleConns:          100,
		IdleConnTimeout:       90 * time.Second,
		TLSHandshakeTimeout:   10 * time.Second,
		ExpectContinueTimeout: 1 * time.Second,
	}

	return &http.Client{
		Timeout:   timeout,
		Transport: transport,
		// Re-validate the target on each redirect hop and cap redirect depth.
		CheckRedirect: func(req *http.Request, via []*http.Request) error {
			if len(via) >= 5 {
				return fmt.Errorf("too many redirects")
			}
			if _, err := ValidateExternalURL(req.URL.String()); err != nil {
				return err
			}
			return nil
		},
	}
}

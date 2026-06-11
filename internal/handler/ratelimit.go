package handler

import (
	"net/http"
	"sync"
	"time"
)

// rateLimiter is a simple in-memory token-bucket limiter keyed by client IP.
// It protects brute-force-prone endpoints (login/register) without external
// dependencies. Stale buckets are evicted periodically to bound memory.
type rateLimiter struct {
	mu       sync.Mutex
	buckets  map[string]*bucket
	rate     float64 // tokens added per second
	capacity float64 // max tokens (burst)
}

type bucket struct {
	tokens float64
	last   time.Time
}

// newRateLimiter allows `burst` requests immediately, refilling at
// `perMinute` requests per minute thereafter.
func newRateLimiter(perMinute, burst int) *rateLimiter {
	rl := &rateLimiter{
		buckets:  make(map[string]*bucket),
		rate:     float64(perMinute) / 60.0,
		capacity: float64(burst),
	}
	go rl.cleanupLoop()
	return rl
}

func (rl *rateLimiter) allow(key string) bool {
	rl.mu.Lock()
	defer rl.mu.Unlock()

	now := time.Now()
	b, ok := rl.buckets[key]
	if !ok {
		rl.buckets[key] = &bucket{tokens: rl.capacity - 1, last: now}
		return true
	}

	// Refill based on elapsed time.
	b.tokens += now.Sub(b.last).Seconds() * rl.rate
	if b.tokens > rl.capacity {
		b.tokens = rl.capacity
	}
	b.last = now

	if b.tokens < 1 {
		return false
	}
	b.tokens--
	return true
}

func (rl *rateLimiter) cleanupLoop() {
	ticker := time.NewTicker(10 * time.Minute)
	defer ticker.Stop()
	for range ticker.C {
		rl.mu.Lock()
		for k, b := range rl.buckets {
			// Drop buckets that have been idle long enough to be full again.
			if time.Since(b.last) > 15*time.Minute {
				delete(rl.buckets, k)
			}
		}
		rl.mu.Unlock()
	}
}

// Middleware returns a chi-compatible middleware enforcing the limit per IP.
func (rl *rateLimiter) Middleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !rl.allow(getClientIP(r)) {
			w.Header().Set("Retry-After", "60")
			respondError(w, http.StatusTooManyRequests, "Too many requests. Please slow down.")
			return
		}
		next.ServeHTTP(w, r)
	})
}

// NewAuthRateLimiter builds the limiter used for authentication routes:
// 10 requests/minute per IP with a small burst.
func NewAuthRateLimiter() func(http.Handler) http.Handler {
	return newRateLimiter(10, 5).Middleware
}

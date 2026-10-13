//! In-memory token-bucket rate limiter keyed by client IP or user ID.

use std::collections::HashMap;
use std::sync::Mutex;
use std::time::{Duration, Instant};

/// Caps the number of tracked keys per limiter.
const MAX_BUCKETS: usize = 50_000;
/// Idle buckets are full again after this long and can be dropped.
const IDLE: Duration = Duration::from_secs(15 * 60);

struct Bucket {
    tokens: f64,
    last: Instant,
}

pub struct RateLimiter {
    buckets: Mutex<HashMap<String, Bucket>>,
    rate: f64,
    capacity: f64,
}

impl RateLimiter {
    /// Allows `burst` requests immediately, refilling at `per_minute`.
    pub fn new(per_minute: u32, burst: u32) -> Self {
        Self {
            buckets: Mutex::new(HashMap::new()),
            rate: f64::from(per_minute) / 60.0,
            capacity: f64::from(burst),
        }
    }

    pub fn allow(&self, key: &str) -> bool {
        let now = Instant::now();
        let mut buckets = self.buckets.lock().unwrap();
        if let Some(b) = buckets.get_mut(key) {
            b.tokens = (b.tokens + now.duration_since(b.last).as_secs_f64() * self.rate)
                .min(self.capacity);
            b.last = now;
            if b.tokens < 1.0 {
                return false;
            }
            b.tokens -= 1.0;
            return true;
        }
        if buckets.len() >= MAX_BUCKETS {
            buckets.retain(|_, b| now.duration_since(b.last) < IDLE);
            // Under a flood of distinct keys, fail closed rather than grow.
            if buckets.len() >= MAX_BUCKETS {
                return false;
            }
        }
        buckets.insert(
            key.to_string(),
            Bucket {
                tokens: self.capacity - 1.0,
                last: now,
            },
        );
        true
    }

    pub fn cleanup(&self) {
        let now = Instant::now();
        self.buckets
            .lock()
            .unwrap()
            .retain(|_, b| now.duration_since(b.last) < IDLE);
    }
}

#[cfg(test)]
mod tests {
    #[test]
    fn burst_then_block() {
        let rl = super::RateLimiter::new(10, 3);
        assert!(rl.allow("a") && rl.allow("a") && rl.allow("a"));
        assert!(!rl.allow("a"));
        assert!(rl.allow("b"));
    }
}

//! Password hashing (Argon2id, PHC strings compatible with existing hashes)
//! and session tokens.

use std::sync::LazyLock;

use argon2::password_hash::{PasswordHash, PasswordHasher, PasswordVerifier, SaltString};
use argon2::{Algorithm, Argon2, Params, Version};
use base64::Engine;
use rand::RngCore;
use tokio::sync::Semaphore;

/// OWASP minimum (m=19 MiB, t=2, p=1): light enough for a small container.
/// Existing hashes keep verifying: parameters are read from the stored hash.
const M_COST: u32 = 19 * 1024;
const T_COST: u32 = 2;
const P_COST: u32 = 1;
const KEY_LEN: usize = 32;
pub const MAX_PASSWORD_LEN: usize = 256;

/// Bounds concurrent Argon2 computations so a burst of logins can't exhaust memory.
static HASH_SEM: Semaphore = Semaphore::const_new(1);

/// Verified against when the user doesn't exist so login timing doesn't
/// reveal which emails have accounts.
static DUMMY_HASH: LazyLock<String> =
    LazyLock::new(|| hash_blocking("flowreader-timing-equaliser").expect("hashing dummy password"));

fn hasher() -> Argon2<'static> {
    Argon2::new(
        Algorithm::Argon2id,
        Version::V0x13,
        Params::new(M_COST, T_COST, P_COST, Some(KEY_LEN)).expect("valid argon2 params"),
    )
}

fn hash_blocking(password: &str) -> anyhow::Result<String> {
    let salt = SaltString::generate(&mut rand::rngs::OsRng);
    hasher()
        .hash_password(password.as_bytes(), &salt)
        .map(|h| h.to_string())
        .map_err(|e| anyhow::anyhow!("hashing password: {e}"))
}

fn verify_blocking(password: &str, encoded: &str) -> bool {
    let Ok(parsed) = PasswordHash::new(encoded) else {
        return false;
    };
    // Refuse absurd parameters from a tampered hash (memory in KiB).
    let Ok(params) = Params::try_from(&parsed) else {
        return false;
    };
    if params.m_cost() > 128 * 1024
        || params.t_cost() > 10
        || params.p_cost() == 0
        || params.p_cost() > 8
    {
        return false;
    }
    Argon2::default()
        .verify_password(password.as_bytes(), &parsed)
        .is_ok()
}

pub async fn hash_password(password: String) -> anyhow::Result<String> {
    let _permit = HASH_SEM.acquire().await?;
    tokio::task::spawn_blocking(move || hash_blocking(&password)).await?
}

/// Checks a password; `None` burns the same CPU against a dummy hash.
pub async fn verify_password(password: String, encoded: Option<String>) -> bool {
    let Ok(_permit) = HASH_SEM.acquire().await else {
        return false;
    };
    tokio::task::spawn_blocking(move || match encoded {
        Some(h) => verify_blocking(&password, &h),
        None => {
            verify_blocking(&password, &DUMMY_HASH);
            false
        }
    })
    .await
    .unwrap_or(false)
}

/// Warms the dummy hash so the first unknown-user login isn't faster.
pub fn init() {
    LazyLock::force(&DUMMY_HASH);
}

/// A cryptographically secure random session token (32 bytes, base64url).
pub fn generate_token() -> String {
    let mut bytes = [0u8; 32];
    rand::rngs::OsRng.fill_bytes(&mut bytes);
    base64::engine::general_purpose::URL_SAFE.encode(bytes)
}

static EMAIL_RE: LazyLock<regex::Regex> = LazyLock::new(|| {
    regex::Regex::new(r"^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$").expect("email regex")
});

pub fn is_valid_email(email: &str) -> bool {
    email.len() <= 254 && EMAIL_RE.is_match(email)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn verifies_hashes_from_the_go_server_format() {
        let h = hash_blocking("motdepasse").unwrap();
        assert!(h.starts_with("$argon2id$v=19$m=19456,t=2,p=1$"));
        assert!(verify_blocking("motdepasse", &h));
        assert!(!verify_blocking("autre", &h));
        assert!(!verify_blocking("motdepasse", "garbage"));
    }

    #[test]
    fn email_validation() {
        assert!(is_valid_email("a.b@example.org"));
        assert!(!is_valid_email("nope"));
    }
}

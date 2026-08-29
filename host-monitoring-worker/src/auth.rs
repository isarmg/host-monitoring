use std::time::{Duration, SystemTime, UNIX_EPOCH};

use argon2::{
    password_hash::{PasswordHash, PasswordHasher, PasswordVerifier, SaltString},
    Argon2,
};
use base64::{Engine as _, engine::general_purpose::URL_SAFE_NO_PAD};
use hmac::{Hmac, Mac};
use sha2::Sha256;

use crate::error::{Error, Result};

type SessionHmac = Hmac<Sha256>;

pub const SESSION_COOKIE: &str = "host_session";

#[derive(Debug, Clone)]
pub struct Auth {
    session_secret: Vec<u8>,
    session_ttl: Duration,
    cookie_secure: bool,
}

impl Auth {
    pub fn new(
        session_secret: Vec<u8>,
        session_ttl: Duration,
        cookie_secure: bool,
    ) -> Result<Self> {
        if session_secret.len() < 32 {
            return Err(Error::BadRequest(
                "session_secret must contain at least 32 bytes".into(),
            ));
        }
        Ok(Self {
            session_secret,
            session_ttl,
            cookie_secure,
        })
    }

    pub fn issue_session(&self, subject: &str) -> Result<String> {
        let now = unix_seconds()?;
        let expires = now + self.session_ttl.as_secs();
        let payload = format!(
            "{}.{}",
            URL_SAFE_NO_PAD.encode(subject.as_bytes()),
            URL_SAFE_NO_PAD.encode(expires.to_string().as_bytes())
        );
        let signature = self.sign(&payload);
        Ok(format!("{payload}.{signature}"))
    }

    pub fn verify_session(&self, token: &str) -> Result<String> {
        let parts = token.split('.').collect::<Vec<_>>();
        if parts.len() != 3 {
            return Err(Error::Unauthorized);
        }
        let payload = format!("{}.{}", parts[0], parts[1]);
        let expected = self.sign(&payload);
        if !constant_time_eq(expected.as_bytes(), parts[2].as_bytes()) {
            return Err(Error::Unauthorized);
        }
        let expires: u64 = URL_SAFE_NO_PAD
            .decode(parts[1])
            .ok()
            .and_then(|bytes| String::from_utf8(bytes).ok())
            .and_then(|value| value.parse().ok())
            .ok_or(Error::Unauthorized)?;
        if expires <= unix_seconds()? {
            return Err(Error::Unauthorized);
        }
        URL_SAFE_NO_PAD
            .decode(parts[0])
            .ok()
            .and_then(|bytes| String::from_utf8(bytes).ok())
            .filter(|subject| !subject.trim().is_empty())
            .ok_or(Error::Unauthorized)
    }

    pub fn session_cookie(&self, token: &str) -> String {
        let mut value = format!(
            "{SESSION_COOKIE}={token}; Path=/; HttpOnly; SameSite=Strict; Max-Age={}",
            self.session_ttl.as_secs()
        );
        if self.cookie_secure {
            value.push_str("; Secure");
        }
        value
    }

    pub fn expired_session_cookie(&self) -> String {
        let mut value = format!("{SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0");
        if self.cookie_secure {
            value.push_str("; Secure");
        }
        value
    }

    fn sign(&self, payload: &str) -> String {
        let mut mac = SessionHmac::new_from_slice(&self.session_secret)
            .expect("session secret has already been validated");
        mac.update(payload.as_bytes());
        URL_SAFE_NO_PAD.encode(mac.finalize().into_bytes())
    }
}

#[derive(Debug, Clone)]
pub struct Principal {
    pub subject: String,
}

pub fn hash_password(password: &str) -> Result<String> {
    if password.len() < 12 {
        return Err(Error::BadRequest(
            "password must contain at least 12 characters".into(),
        ));
    }
    let salt = SaltString::generate(&mut argon2::password_hash::rand_core::OsRng);
    Argon2::default()
        .hash_password(password.as_bytes(), &salt)
        .map(|hash| hash.to_string())
        .map_err(|error| Error::BadRequest(format!("password hash failed: {error}")))
}

pub fn verify_password(password: &str, encoded: &str) -> bool {
    let Ok(hash) = PasswordHash::new(encoded) else {
        return false;
    };
    Argon2::default()
        .verify_password(password.as_bytes(), &hash)
        .is_ok()
}

pub fn parse_cookie_token(headers: &axum::http::HeaderMap) -> Option<String> {
    headers
        .get(axum::http::header::COOKIE)?
        .to_str()
        .ok()?
        .split(';')
        .find_map(|part| {
            let (name, value) = part.trim().split_once('=')?;
            (name == SESSION_COOKIE && !value.is_empty()).then(|| value.to_string())
        })
}

pub fn require_console(
    headers: &axum::http::HeaderMap,
    state: &crate::http::AppState,
) -> Result<Principal> {
    let token = parse_cookie_token(headers).ok_or(Error::Unauthorized)?;
    let subject = state.auth.verify_session(&token)?;
    Ok(Principal { subject })
}

fn unix_seconds() -> Result<u64> {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs())
        .map_err(|error| Error::BadRequest(error.to_string()))
}

fn constant_time_eq(left: &[u8], right: &[u8]) -> bool {
    if left.len() != right.len() {
        return false;
    }
    left.iter()
        .zip(right)
        .fold(0u8, |acc, (a, b)| acc | (a ^ b))
        == 0
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn session_round_trip_and_password_hash() {
        let auth = Auth::new(vec![7; 32], Duration::from_secs(60), false).unwrap();
        let token = auth.issue_session("operator").unwrap();
        assert_eq!(auth.verify_session(&token).unwrap(), "operator");
        assert!(auth.verify_session("bad").is_err());

        let hash = hash_password("a-very-long-password").unwrap();
        assert!(verify_password("a-very-long-password", &hash));
        assert!(!verify_password("wrong-password", &hash));
    }
}

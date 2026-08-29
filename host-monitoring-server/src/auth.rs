use std::time::Duration;

use crate::error::{Error, Result};

pub const SESSION_COOKIE: &str = "host_session";

#[derive(Clone)]
pub struct Auth {
    issuer: isarmg_auth::SessionIssuer,
}

impl Auth {
    pub fn new(secret: Vec<u8>, ttl: Duration, cookie_secure: bool) -> Result<Self> {
        Ok(Self {
            issuer: isarmg_auth::SessionIssuer::new(secret, ttl, cookie_secure)
                .map_err(|error| Error::BadRequest(error.to_string()))?,
        })
    }

    pub fn issue_session(&self, subject: &str) -> Result<String> {
        self.issuer
            .issue(subject)
            .map_err(|error| Error::BadRequest(error.to_string()))
    }

    pub fn verify_session(&self, token: &str) -> Result<String> {
        self.issuer
            .verify(token)
            .map_err(|_| Error::Unauthorized)
    }

    pub fn session_cookie(&self, token: &str) -> String {
        self.issuer.session_cookie(SESSION_COOKIE, token)
    }

    pub fn expired_session_cookie(&self) -> String {
        self.issuer.expired_cookie(SESSION_COOKIE)
    }
}

#[derive(Debug, Clone)]
pub struct Principal {
    pub subject: String,
}

pub use isarmg_auth::{hash_password, verify_password};

pub fn parse_cookie_token(headers: &axum::http::HeaderMap) -> Option<String> {
    isarmg_auth::parse_cookie_token(SESSION_COOKIE, headers)
}

pub fn require_console(
    headers: &axum::http::HeaderMap,
    state: &crate::http::AppState,
) -> Result<Principal> {
    let token = parse_cookie_token(headers).ok_or(Error::Unauthorized)?;
    let subject = state.auth.verify_session(&token)?;
    Ok(Principal { subject })
}

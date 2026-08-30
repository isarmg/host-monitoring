use std::time::Duration;

use axum::http::{HeaderMap, Uri, header};
use chrono::{DateTime, Utc};
use sqlx::FromRow;
use uuid::Uuid;

use crate::error::{Error, Result, database};

pub const CSRF_HEADER: &str = "x-csrf-token";
const PRODUCTION_SESSION_COOKIE: &str = "__Host-host_session";
const DEVELOPMENT_SESSION_COOKIE: &str = "host_session";
const MAX_CSRF_TOKENS_PER_SESSION: i64 = 8;
const SESSION_TOUCH_INTERVAL: chrono::Duration = chrono::Duration::seconds(60);

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CookieMode {
    Production,
    LoopbackDevelopment,
}

#[derive(Clone)]
pub struct Auth {
    idle_ttl: chrono::Duration,
    absolute_ttl: chrono::Duration,
    cookie_mode: CookieMode,
}

impl Auth {
    pub fn new(
        idle_ttl: Duration,
        absolute_ttl: Duration,
        cookie_mode: CookieMode,
    ) -> Result<Self> {
        if idle_ttl.is_zero() || absolute_ttl.is_zero() || idle_ttl > absolute_ttl {
            return Err(Error::BadRequest(
                "session TTLs must be positive and idle TTL must not exceed absolute TTL".into(),
            ));
        }
        let idle_ttl = chrono::Duration::from_std(idle_ttl)
            .map_err(|error| Error::BadRequest(error.to_string()))?;
        let absolute_ttl = chrono::Duration::from_std(absolute_ttl)
            .map_err(|error| Error::BadRequest(error.to_string()))?;
        Ok(Self {
            idle_ttl,
            absolute_ttl,
            cookie_mode,
        })
    }

    pub async fn issue_session(
        &self,
        pool: &sqlx::SqlitePool,
        user: &crate::store::StoredUser,
    ) -> Result<IssuedSession> {
        let session_id = Uuid::new_v4();
        let token = random_token();
        let now = Utc::now();
        let absolute_expires_at = now + self.absolute_ttl;
        let idle_expires_at = std::cmp::min(now + self.idle_ttl, absolute_expires_at);
        let mut tx = pool.begin().await.map_err(database)?;
        let inserted = sqlx::query(
            r#"INSERT INTO auth_sessions(
                   session_id,user_id,token_hash,user_session_version,created_at,last_seen_at,
                   idle_expires_at,absolute_expires_at
               )
               SELECT ?,u.user_id,?,u.session_version,?,?,?,?
               FROM auth_users u
               WHERE u.user_id=? AND u.active=true AND u.session_version=?"#,
        )
        .bind(session_id)
        .bind(crate::token_hash(&token))
        .bind(now)
        .bind(now)
        .bind(idle_expires_at)
        .bind(absolute_expires_at)
        .bind(&user.user_id)
        .bind(user.session_version)
        .execute(&mut *tx)
        .await
        .map_err(database)?;
        if inserted.rows_affected() != 1 {
            tx.rollback().await.map_err(database)?;
            return Err(Error::Unauthorized);
        }
        let csrf_token = insert_csrf_token(&mut tx, session_id)
            .await
            .map_err(database)?;
        tx.commit().await.map_err(database)?;
        Ok(IssuedSession { token, csrf_token })
    }

    pub async fn issue_csrf_token(
        &self,
        pool: &sqlx::SqlitePool,
        session_id: Uuid,
    ) -> Result<String> {
        let now = Utc::now();
        let token = random_token();
        let mut tx = pool.begin().await.map_err(database)?;
        let inserted = sqlx::query(
            r#"INSERT INTO auth_session_csrf_tokens(session_id,token_hash,created_at)
               SELECT s.session_id,?,?
               FROM auth_sessions s
               JOIN auth_users u ON u.user_id=s.user_id
               WHERE s.session_id=? AND s.revoked_at IS NULL
                 AND s.idle_expires_at>? AND s.absolute_expires_at>?
                 AND u.active=true AND u.session_version=s.user_session_version"#,
        )
        .bind(crate::token_hash(&token))
        .bind(now)
        .bind(session_id)
        .bind(now)
        .bind(now)
        .execute(&mut *tx)
        .await
        .map_err(database)?;
        if inserted.rows_affected() != 1 {
            tx.rollback().await.map_err(database)?;
            return Err(Error::Unauthorized);
        }
        prune_csrf_tokens(&mut tx, session_id)
            .await
            .map_err(database)?;
        tx.commit().await.map_err(database)?;
        Ok(token)
    }

    pub async fn revoke_session(&self, pool: &sqlx::SqlitePool, session_id: Uuid) -> Result<()> {
        let mut tx = pool.begin().await.map_err(database)?;
        sqlx::query(
            "UPDATE auth_sessions SET revoked_at=COALESCE(revoked_at,?) WHERE session_id=?",
        )
        .bind(Utc::now())
        .bind(session_id)
        .execute(&mut *tx)
        .await
        .map_err(database)?;
        sqlx::query("DELETE FROM auth_session_csrf_tokens WHERE session_id=?")
            .bind(session_id)
            .execute(&mut *tx)
            .await
            .map_err(database)?;
        tx.commit().await.map_err(database)?;
        Ok(())
    }

    pub fn session_cookie(&self, token: &str) -> String {
        let secure = match self.cookie_mode {
            CookieMode::Production => "; Secure",
            CookieMode::LoopbackDevelopment => "",
        };
        format!(
            "{}={token}; Path=/; Max-Age={}; HttpOnly; SameSite=Strict{secure}",
            self.session_cookie_name(),
            self.absolute_ttl.num_seconds()
        )
    }

    pub fn expired_session_cookie(&self) -> String {
        let secure = match self.cookie_mode {
            CookieMode::Production => "; Secure",
            CookieMode::LoopbackDevelopment => "",
        };
        format!(
            "{}=; Path=/; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; SameSite=Strict{secure}",
            self.session_cookie_name()
        )
    }

    pub fn session_cookie_name(&self) -> &'static str {
        match self.cookie_mode {
            CookieMode::Production => PRODUCTION_SESSION_COOKIE,
            CookieMode::LoopbackDevelopment => DEVELOPMENT_SESSION_COOKIE,
        }
    }

    pub fn uses_insecure_development_cookie(&self) -> bool {
        self.cookie_mode == CookieMode::LoopbackDevelopment
    }
}

#[derive(Debug)]
pub struct IssuedSession {
    pub token: String,
    pub csrf_token: String,
}

#[derive(Debug, Clone)]
pub struct Principal {
    pub subject: String,
    pub email: String,
    pub session_id: Uuid,
}

#[derive(FromRow)]
struct SessionRow {
    session_id: Uuid,
    user_id: String,
    email: String,
    last_seen_at: DateTime<Utc>,
    idle_expires_at: DateTime<Utc>,
    absolute_expires_at: DateTime<Utc>,
}

pub use isarmg_auth::{hash_password, verify_password};

pub async fn require_console(
    headers: &HeaderMap,
    state: &crate::http::AppState,
    csrf_required: bool,
) -> Result<Principal> {
    let token = isarmg_auth::parse_cookie_token(state.auth.session_cookie_name(), headers)
        .filter(|token| valid_token_shape(token))
        .ok_or(Error::Unauthorized)?;
    let now = Utc::now();
    let row = sqlx::query_as::<_, SessionRow>(
        r#"SELECT s.session_id,s.user_id,u.email,s.last_seen_at,s.idle_expires_at,
                  s.absolute_expires_at
           FROM auth_sessions s
           JOIN auth_users u ON u.user_id=s.user_id
           WHERE s.token_hash=? AND s.revoked_at IS NULL
             AND s.idle_expires_at>? AND s.absolute_expires_at>?
             AND u.active=true AND u.session_version=s.user_session_version"#,
    )
    .bind(crate::token_hash(&token))
    .bind(now)
    .bind(now)
    .fetch_optional(&state.pool)
    .await
    .map_err(database)?;
    let Some(row) = row else {
        return Err(Error::Unauthorized);
    };

    if csrf_required && !same_origin(headers, state.auth.cookie_mode) {
        return Err(Error::Forbidden);
    }

    let csrf_hash = if csrf_required {
        let csrf_token = headers
            .get(CSRF_HEADER)
            .and_then(|value| value.to_str().ok())
            .filter(|token| valid_token_shape(token));
        let Some(csrf_token) = csrf_token else {
            return Err(Error::Forbidden);
        };
        let csrf_hash = crate::token_hash(csrf_token);
        let valid: bool = sqlx::query_scalar(
            "SELECT EXISTS(SELECT 1 FROM auth_session_csrf_tokens WHERE session_id=? AND token_hash=?)",
        )
        .bind(row.session_id)
        .bind(&csrf_hash)
        .fetch_one(&state.pool)
        .await
        .map_err(database)?;
        if !valid {
            return Err(Error::Forbidden);
        }
        Some(csrf_hash)
    } else {
        None
    };

    let touch_interval = std::cmp::min(SESSION_TOUCH_INTERVAL, state.auth.idle_ttl / 2);
    if now - row.last_seen_at < touch_interval && row.idle_expires_at - now > touch_interval {
        return Ok(Principal {
            subject: row.user_id,
            email: row.email,
            session_id: row.session_id,
        });
    }

    let idle_expires_at = std::cmp::min(now + state.auth.idle_ttl, row.absolute_expires_at);
    let updated = sqlx::query(
        r#"UPDATE auth_sessions SET last_seen_at=?,idle_expires_at=?
           WHERE session_id=? AND revoked_at IS NULL
             AND idle_expires_at>? AND absolute_expires_at>?
             AND EXISTS(
                 SELECT 1 FROM auth_users u
                 WHERE u.user_id=auth_sessions.user_id AND u.active=true
                   AND u.session_version=auth_sessions.user_session_version
             )
             AND (?=false OR EXISTS(
                 SELECT 1 FROM auth_session_csrf_tokens c
                 WHERE c.session_id=auth_sessions.session_id AND c.token_hash=?
             ))"#,
    )
    .bind(now)
    .bind(idle_expires_at)
    .bind(row.session_id)
    .bind(now)
    .bind(now)
    .bind(csrf_required)
    .bind(csrf_hash)
    .execute(&state.pool)
    .await
    .map_err(database)?;
    if updated.rows_affected() != 1 {
        return Err(Error::Unauthorized);
    }
    Ok(Principal {
        subject: row.user_id,
        email: row.email,
        session_id: row.session_id,
    })
}

fn same_origin(headers: &HeaderMap, cookie_mode: CookieMode) -> bool {
    let mut origins = headers.get_all(header::ORIGIN).iter();
    let Some(origin) = origins.next().and_then(|value| value.to_str().ok()) else {
        return false;
    };
    if origins.next().is_some() {
        return false;
    }
    let Ok(origin) = origin.parse::<Uri>() else {
        return false;
    };
    let expected_scheme = match cookie_mode {
        CookieMode::Production => "https",
        CookieMode::LoopbackDevelopment => "http",
    };
    if !origin
        .scheme_str()
        .is_some_and(|scheme| scheme.eq_ignore_ascii_case(expected_scheme))
        || origin.query().is_some()
        || origin.path() != "/"
    {
        return false;
    }
    let Some(origin_authority) = origin.authority() else {
        return false;
    };

    let mut hosts = headers.get_all(header::HOST).iter();
    let Some(host) = hosts.next().and_then(|value| value.to_str().ok()) else {
        return false;
    };
    if hosts.next().is_some() {
        return false;
    }
    origin_authority.as_str().eq_ignore_ascii_case(host)
}

async fn insert_csrf_token(
    tx: &mut sqlx::Transaction<'_, sqlx::Sqlite>,
    session_id: Uuid,
) -> anyhow::Result<String> {
    let token = random_token();
    sqlx::query(
        "INSERT INTO auth_session_csrf_tokens(session_id,token_hash,created_at) VALUES(?,?,?)",
    )
    .bind(session_id)
    .bind(crate::token_hash(&token))
    .bind(Utc::now())
    .execute(&mut **tx)
    .await?;
    prune_csrf_tokens(tx, session_id).await?;
    Ok(token)
}

async fn prune_csrf_tokens(
    tx: &mut sqlx::Transaction<'_, sqlx::Sqlite>,
    session_id: Uuid,
) -> anyhow::Result<()> {
    sqlx::query(
        r#"DELETE FROM auth_session_csrf_tokens
           WHERE csrf_id IN (
               SELECT csrf_id FROM auth_session_csrf_tokens
               WHERE session_id=? ORDER BY csrf_id DESC LIMIT -1 OFFSET ?
           )"#,
    )
    .bind(session_id)
    .bind(MAX_CSRF_TOKENS_PER_SESSION)
    .execute(&mut **tx)
    .await?;
    Ok(())
}

fn random_token() -> String {
    isarmg_auth::csrf_token()
}

fn valid_token_shape(token: &str) -> bool {
    token.len() == 43
        && token
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_'))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn production_cookie_uses_host_prefix_and_required_attributes() {
        let auth = Auth::new(
            Duration::from_secs(60),
            Duration::from_secs(600),
            CookieMode::Production,
        )
        .unwrap();
        let cookie = auth.session_cookie("token");
        assert!(cookie.starts_with("__Host-host_session=token;"));
        let expired = auth.expired_session_cookie();
        assert!(expired.starts_with("__Host-host_session=;"));
        for value in [&cookie, &expired] {
            for attribute in ["Path=/", "Secure", "HttpOnly", "SameSite=Strict"] {
                assert!(value.contains(attribute));
            }
            assert!(!value.to_ascii_lowercase().contains("domain="));
        }
        assert!(cookie.contains("Max-Age=600"));
        assert!(expired.contains("Max-Age=0"));
    }

    #[test]
    fn development_cookie_is_explicitly_unprefixed_and_insecure() {
        let auth = Auth::new(
            Duration::from_secs(60),
            Duration::from_secs(600),
            CookieMode::LoopbackDevelopment,
        )
        .unwrap();
        let cookie = auth.session_cookie("token");
        assert!(cookie.starts_with("host_session=token;"));
        assert!(!cookie.contains("Secure"));
        assert!(!cookie.contains("__Host-"));
    }
}

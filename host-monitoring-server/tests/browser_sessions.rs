use std::time::Duration;

use axum::{
    Router,
    body::Body,
    extract::ConnectInfo,
    http::{Method, Request, Response, StatusCode, header},
};
use chrono::Utc;
use host_monitoring_server::{
    auth::{Auth, CSRF_HEADER, CookieMode},
    http::{AppState, router},
    store, token_hash,
};
use http_body_util::BodyExt;
use serde_json::{Value, json};
use sqlx::SqlitePool;
use tower::ServiceExt;
use uuid::Uuid;

struct Fixture {
    app: Router,
    pool: SqlitePool,
}

struct BrowserCredentials {
    cookie: String,
    session_token: String,
    csrf_token: String,
}

async fn fixture() -> Fixture {
    let pool = sqlx::sqlite::SqlitePoolOptions::new()
        .max_connections(1)
        .connect("sqlite::memory:")
        .await
        .expect("open test database");
    store::migrate(&pool).await.expect("migrate test database");
    store::ensure_admin_user(&pool, "admin@example.com", Some("correct-password"))
        .await
        .expect("seed administrator");
    let auth = Auth::new(
        Duration::from_secs(60),
        Duration::from_secs(600),
        CookieMode::LoopbackDevelopment,
    )
    .expect("build development auth");
    Fixture {
        app: router(AppState::new(pool.clone(), auth)),
        pool,
    }
}

fn request(
    method: Method,
    uri: &str,
    cookie: Option<&str>,
    csrf_token: Option<&str>,
    body: Option<Value>,
) -> Request<Body> {
    let unsafe_cookie_request = cookie.is_some()
        && (method == Method::POST
            || method == Method::PUT
            || method == Method::PATCH
            || method == Method::DELETE);
    let mut builder = Request::builder()
        .method(method)
        .uri(uri)
        .header(header::HOST, "console.example");
    if unsafe_cookie_request {
        builder = builder.header(header::ORIGIN, "http://console.example");
    }
    if let Some(cookie) = cookie {
        builder = builder.header(header::COOKIE, cookie);
    }
    if let Some(csrf_token) = csrf_token {
        builder = builder.header(CSRF_HEADER, csrf_token);
    }
    let body = if let Some(body) = body {
        builder = builder.header(header::CONTENT_TYPE, "application/json");
        Body::from(body.to_string())
    } else {
        Body::empty()
    };
    let mut request = builder.body(body).expect("build request");
    request.extensions_mut().insert(ConnectInfo(
        "192.0.2.10:41000"
            .parse::<std::net::SocketAddr>()
            .expect("test peer address"),
    ));
    request
}

async fn send(fixture: &Fixture, request: Request<Body>) -> Response<Body> {
    fixture
        .app
        .clone()
        .oneshot(request)
        .await
        .expect("router response")
}

async fn response_json(response: Response<Body>) -> Value {
    let bytes = response
        .into_body()
        .collect()
        .await
        .expect("collect response body")
        .to_bytes();
    serde_json::from_slice(&bytes).expect("JSON response body")
}

async fn login(fixture: &Fixture, password: &str) -> BrowserCredentials {
    let response = send(
        fixture,
        request(
            Method::POST,
            "/api/v1/auth/login",
            None,
            None,
            Some(json!({
                "email": "admin@example.com",
                "password": password
            })),
        ),
    )
    .await;
    assert_eq!(response.status(), StatusCode::OK);
    assert_eq!(
        response.headers().get(header::CACHE_CONTROL).unwrap(),
        "no-store"
    );
    let set_cookie = response
        .headers()
        .get(header::SET_COOKIE)
        .expect("login sets session cookie")
        .to_str()
        .unwrap();
    let cookie = set_cookie
        .split(';')
        .next()
        .expect("cookie pair")
        .to_string();
    let session_token = cookie.split_once('=').expect("cookie token").1.to_string();
    let json = response_json(response).await;
    BrowserCredentials {
        cookie,
        session_token,
        csrf_token: json["csrf_token"].as_str().unwrap().to_string(),
    }
}

async fn reload_session(fixture: &Fixture, cookie: &str) -> (StatusCode, Option<String>) {
    let response = send(
        fixture,
        request(
            Method::GET,
            "/api/v1/auth/session",
            Some(cookie),
            None,
            None,
        ),
    )
    .await;
    let status = response.status();
    if status != StatusCode::OK {
        return (status, None);
    }
    let json = response_json(response).await;
    (
        status,
        Some(json["csrf_token"].as_str().unwrap().to_string()),
    )
}

#[tokio::test]
async fn login_reload_csrf_and_logout_use_revocable_database_sessions() {
    let fixture = fixture().await;
    let credentials = login(&fixture, "correct-password").await;
    assert_eq!(credentials.session_token.len(), 43);
    assert_eq!(credentials.csrf_token.len(), 43);

    let (stored_session_hash, session_id): (String, Uuid) =
        sqlx::query_as("SELECT token_hash,session_id FROM auth_sessions WHERE token_hash=?")
            .bind(token_hash(&credentials.session_token))
            .fetch_one(&fixture.pool)
            .await
            .expect("persisted session digest");
    assert_eq!(stored_session_hash, token_hash(&credentials.session_token));
    assert_ne!(stored_session_hash, credentials.session_token);
    let stored_csrf_hashes: Vec<String> =
        sqlx::query_scalar("SELECT token_hash FROM auth_session_csrf_tokens WHERE session_id=?")
            .bind(session_id)
            .fetch_all(&fixture.pool)
            .await
            .expect("persisted CSRF digests");
    assert!(stored_csrf_hashes.contains(&token_hash(&credentials.csrf_token)));
    assert!(!stored_csrf_hashes.contains(&credentials.csrf_token));

    let short_idle_expiry = Utc::now() + chrono::Duration::seconds(1);
    sqlx::query("UPDATE auth_sessions SET idle_expires_at=? WHERE session_id=?")
        .bind(short_idle_expiry)
        .bind(session_id)
        .execute(&fixture.pool)
        .await
        .expect("shorten idle expiry");
    let (status, reload_csrf) = reload_session(&fixture, &credentials.cookie).await;
    assert_eq!(status, StatusCode::OK);
    let reload_csrf = reload_csrf.expect("reload returns a CSRF token");
    assert_ne!(reload_csrf, credentials.csrf_token);
    let (refreshed_idle_expiry, absolute_expiry): (chrono::DateTime<Utc>, chrono::DateTime<Utc>) =
        sqlx::query_as(
            "SELECT idle_expires_at,absolute_expires_at FROM auth_sessions WHERE session_id=?",
        )
        .bind(session_id)
        .fetch_one(&fixture.pool)
        .await
        .expect("read refreshed expiry");
    assert!(refreshed_idle_expiry > short_idle_expiry);
    assert!(refreshed_idle_expiry <= absolute_expiry);

    let invite = json!({"display_name": "CSRF Host", "expires_in_minutes": 15});
    let mut missing_origin = request(
        Method::POST,
        "/api/monitoring/agent-instances",
        Some(&credentials.cookie),
        Some(&reload_csrf),
        Some(invite.clone()),
    );
    missing_origin.headers_mut().remove(header::ORIGIN);
    let response = send(&fixture, missing_origin).await;
    assert_eq!(response.status(), StatusCode::FORBIDDEN);

    let mut cross_origin = request(
        Method::POST,
        "/api/monitoring/agent-instances",
        Some(&credentials.cookie),
        Some(&reload_csrf),
        Some(invite.clone()),
    );
    cross_origin
        .headers_mut()
        .insert(header::ORIGIN, "http://attacker.example".parse().unwrap());
    let response = send(&fixture, cross_origin).await;
    assert_eq!(response.status(), StatusCode::FORBIDDEN);

    for csrf in [None, Some("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa")] {
        let response = send(
            &fixture,
            request(
                Method::POST,
                "/api/monitoring/agent-instances",
                Some(&credentials.cookie),
                csrf,
                Some(invite.clone()),
            ),
        )
        .await;
        assert_eq!(response.status(), StatusCode::FORBIDDEN);
    }
    let invite_count: i64 = sqlx::query_scalar("SELECT count(*) FROM agent_instance_invites")
        .fetch_one(&fixture.pool)
        .await
        .unwrap();
    assert_eq!(invite_count, 0);

    let response = send(
        &fixture,
        request(
            Method::POST,
            "/api/monitoring/agent-instances",
            Some(&credentials.cookie),
            Some(&reload_csrf),
            Some(invite),
        ),
    )
    .await;
    assert_eq!(response.status(), StatusCode::CREATED);

    let other = login(&fixture, "correct-password").await;
    let cross_session = send(
        &fixture,
        request(
            Method::POST,
            "/api/monitoring/agent-instances",
            Some(&other.cookie),
            Some(&reload_csrf),
            Some(json!({"display_name": "Wrong Session", "expires_in_minutes": 15})),
        ),
    )
    .await;
    assert_eq!(cross_session.status(), StatusCode::FORBIDDEN);
    let other_logout = send(
        &fixture,
        request(
            Method::POST,
            "/api/v1/auth/logout",
            Some(&other.cookie),
            Some(&other.csrf_token),
            None,
        ),
    )
    .await;
    assert_eq!(other_logout.status(), StatusCode::NO_CONTENT);

    let missing_csrf_logout = send(
        &fixture,
        request(
            Method::POST,
            "/api/v1/auth/logout",
            Some(&credentials.cookie),
            None,
            None,
        ),
    )
    .await;
    assert_eq!(missing_csrf_logout.status(), StatusCode::FORBIDDEN);
    assert_eq!(
        reload_session(&fixture, &credentials.cookie).await.0,
        StatusCode::OK
    );

    let logout = send(
        &fixture,
        request(
            Method::POST,
            "/api/v1/auth/logout",
            Some(&credentials.cookie),
            Some(&reload_csrf),
            None,
        ),
    )
    .await;
    assert_eq!(logout.status(), StatusCode::NO_CONTENT);
    let expired_cookie = logout
        .headers()
        .get(header::SET_COOKIE)
        .unwrap()
        .to_str()
        .unwrap();
    assert!(expired_cookie.starts_with("host_session=;"));
    assert!(expired_cookie.contains("Max-Age=0"));
    assert_eq!(
        reload_session(&fixture, &credentials.cookie).await.0,
        StatusCode::UNAUTHORIZED
    );

    let (revoked_at, csrf_count): (Option<String>, i64) = sqlx::query_as(
        r#"SELECT s.revoked_at,
                  (SELECT count(*) FROM auth_session_csrf_tokens c WHERE c.session_id=s.session_id)
           FROM auth_sessions s WHERE s.session_id=?"#,
    )
    .bind(session_id)
    .fetch_one(&fixture.pool)
    .await
    .expect("revoked session record");
    assert!(revoked_at.is_some());
    assert_eq!(csrf_count, 0);

    let agent_response = send(
        &fixture,
        request(
            Method::POST,
            "/api/host-m-agent/v1/pairing-requests",
            None,
            None,
            Some(json!({})),
        ),
    )
    .await;
    assert_ne!(agent_response.status(), StatusCode::UNAUTHORIZED);
    assert_ne!(agent_response.status(), StatusCode::FORBIDDEN);
}

#[tokio::test]
async fn expiry_password_reset_and_disable_invalidate_existing_sessions() {
    let fixture = fixture().await;

    let idle_expired = login(&fixture, "correct-password").await;
    let past = Utc::now() - chrono::Duration::seconds(1);
    sqlx::query("UPDATE auth_sessions SET idle_expires_at=? WHERE token_hash=?")
        .bind(past)
        .bind(token_hash(&idle_expired.session_token))
        .execute(&fixture.pool)
        .await
        .expect("expire idle window");
    assert_eq!(
        reload_session(&fixture, &idle_expired.cookie).await.0,
        StatusCode::UNAUTHORIZED
    );

    let absolute_expired = login(&fixture, "correct-password").await;
    sqlx::query(
        "UPDATE auth_sessions SET idle_expires_at=?,absolute_expires_at=? WHERE token_hash=?",
    )
    .bind(past)
    .bind(past)
    .bind(token_hash(&absolute_expired.session_token))
    .execute(&fixture.pool)
    .await
    .expect("expire absolute window");
    assert_eq!(
        reload_session(&fixture, &absolute_expired.cookie).await.0,
        StatusCode::UNAUTHORIZED
    );

    let before_reset = login(&fixture, "correct-password").await;
    store::reset_admin_password(&fixture.pool, "admin@example.com", "new-password")
        .await
        .expect("reset password");
    assert_eq!(
        reload_session(&fixture, &before_reset.cookie).await.0,
        StatusCode::UNAUTHORIZED
    );
    let session_version: i64 =
        sqlx::query_scalar("SELECT session_version FROM auth_users WHERE email=?")
            .bind("admin@example.com")
            .fetch_one(&fixture.pool)
            .await
            .unwrap();
    assert_eq!(session_version, 2);

    let after_reset = login(&fixture, "new-password").await;
    sqlx::query("UPDATE auth_users SET active=false WHERE email=?")
        .bind("admin@example.com")
        .execute(&fixture.pool)
        .await
        .expect("disable user");
    assert_eq!(
        reload_session(&fixture, &after_reset.cookie).await.0,
        StatusCode::UNAUTHORIZED
    );
    let disabled_login = send(
        &fixture,
        request(
            Method::POST,
            "/api/v1/auth/login",
            None,
            None,
            Some(json!({
                "email": "admin@example.com",
                "password": "new-password"
            })),
        ),
    )
    .await;
    assert_eq!(disabled_login.status(), StatusCode::UNAUTHORIZED);

    sqlx::query("UPDATE auth_users SET active=true WHERE email=?")
        .bind("admin@example.com")
        .execute(&fixture.pool)
        .await
        .expect("re-enable user");
    assert_eq!(
        reload_session(&fixture, &after_reset.cookie).await.0,
        StatusCode::UNAUTHORIZED
    );
    let active_csrf_tokens: i64 = sqlx::query_scalar(
        r#"SELECT count(*) FROM auth_session_csrf_tokens c
           JOIN auth_sessions s ON s.session_id=c.session_id
           JOIN auth_users u ON u.user_id=s.user_id
           WHERE u.email=?"#,
    )
    .bind("admin@example.com")
    .fetch_one(&fixture.pool)
    .await
    .unwrap();
    assert_eq!(active_csrf_tokens, 0);
}

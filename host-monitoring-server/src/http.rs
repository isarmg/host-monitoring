use std::{collections::HashMap, sync::Arc, time::Instant};

use axum::{
    Json, Router,
    extract::{DefaultBodyLimit, Extension, Path, Query, Request, State},
    http::{HeaderMap, HeaderValue, Method, StatusCode, header},
    middleware::{self, Next},
    response::{IntoResponse, Response},
    routing::{get, post},
};
use chrono::Utc;
use host_protocol::{
    AGENT_REPORT_MAX_BODY_BYTES, ActivateAgentRequest, ActivateAgentResponse,
    ActivatePairingStatus, AgentPairingRequest, AgentPairingResponse, AgentPairingStatusResponse,
    AgentReport, AgentReportAck,
};
use tokio::sync::Mutex;
use tower_http::services::ServeDir;

use crate::{
    auth::{self, Principal},
    error::{Error, Result, database},
    model::{
        CreateAgentInstanceRequest, CreatedAgentInstance, HistoryQuery, HistoryResponse,
        HostDetailResponse, HostListQuery, HostListResponse, UpdateMonitoringRemarkRequest,
        canonical_uuid, validate_pairing, validate_report,
    },
    store,
};

#[derive(Clone)]
pub struct AppState {
    pub pool: sqlx::SqlitePool,
    pub auth: crate::auth::Auth,
    report_buckets: Arc<Mutex<HashMap<String, TokenBucket>>>,
}

impl AppState {
    pub fn new(pool: sqlx::SqlitePool, auth: crate::auth::Auth) -> Self {
        Self {
            pool,
            auth,
            report_buckets: Arc::new(Mutex::new(HashMap::new())),
        }
    }
}

struct TokenBucket {
    tokens: f64,
    updated: Instant,
}

impl TokenBucket {
    fn allow(&mut self) -> bool {
        let now = Instant::now();
        self.tokens =
            (self.tokens + now.duration_since(self.updated).as_secs_f64() * 16.0).min(64.0);
        self.updated = now;
        if self.tokens < 1.0 {
            return false;
        }
        self.tokens -= 1.0;
        true
    }
}

pub fn router(state: AppState) -> Router {
    let public_auth = Router::new().route("/api/v1/auth/login", post(login));

    let protected_auth = Router::new()
        .route("/api/v1/auth/logout", post(logout))
        .route("/api/v1/auth/session", get(session))
        .route_layer(middleware::from_fn_with_state(
            state.clone(),
            console_admission,
        ));

    let console = Router::new()
        .route("/api/monitoring/hosts", get(list_hosts))
        .route("/api/monitoring/hosts/{host_id}", get(host_detail))
        .route("/api/monitoring/hosts/{host_id}/history", get(host_history))
        .route(
            "/api/monitoring/agent-instances",
            get(list_instances).post(create_instance),
        )
        .route(
            "/api/monitoring/agent-instances/{request_id}",
            axum::routing::delete(cancel_instance),
        )
        .route(
            "/api/monitoring/managed-instances/{host_id}",
            axum::routing::patch(update_remark).delete(delete_host),
        )
        .route("/api/host-m-agent/v1/activate-admin", post(activate_admin))
        .layer(DefaultBodyLimit::max(16 * 1024))
        .route_layer(middleware::from_fn_with_state(
            state.clone(),
            console_admission,
        ));
    let agent = Router::new()
        .route("/api/host-m-agent/v1/report", post(report))
        .route(
            "/api/host-m-agent/v1/pairing-requests",
            post(create_pairing),
        )
        .route(
            "/api/host-m-agent/v1/pairing-requests/{request_id}",
            get(pairing_public),
        )
        .route(
            "/api/host-m-agent/v1/pairing-requests/{request_id}/status",
            post(pairing_status),
        )
        .route("/api/host-m-agent/v1/activate", post(activate_capability))
        .layer(DefaultBodyLimit::max(AGENT_REPORT_MAX_BODY_BYTES));
    Router::new()
        .route("/health", get(live))
        .route("/health/live", get(live))
        .route("/health/ready", get(ready))
        .merge(public_auth)
        .merge(protected_auth)
        .merge(console)
        .merge(agent)
        .fallback_service(ServeDir::new(
            std::env::var("HOST_MONITORING_STATIC_DIR").unwrap_or_else(|_| "web/dist".to_string()),
        ))
        .with_state(state)
}

async fn console_admission(
    State(state): State<AppState>,
    mut request: Request,
    next: Next,
) -> Result<Response> {
    let principal =
        auth::require_console(request.headers(), &state, requires_csrf(request.method())).await?;
    request.extensions_mut().insert(principal);
    Ok(next.run(request).await)
}

fn requires_csrf(method: &Method) -> bool {
    method == Method::POST
        || method == Method::PUT
        || method == Method::PATCH
        || method == Method::DELETE
}

#[derive(serde::Deserialize)]
#[serde(deny_unknown_fields)]
struct LoginRequest {
    email: String,
    password: String,
}

#[derive(serde::Serialize)]
struct BrowserSessionResponse {
    authenticated: bool,
    user_id: String,
    email: String,
    csrf_token: String,
}

async fn login(
    State(state): State<AppState>,
    Json(request): Json<LoginRequest>,
) -> Result<Response> {
    let user = store::find_active_user_by_email(&state.pool, &request.email)
        .await
        .map_err(database)?
        .ok_or(Error::Unauthorized)?;
    if !crate::auth::verify_password(&request.password, &user.password_hash) {
        return Err(Error::Unauthorized);
    }
    let issued = state.auth.issue_session(&state.pool, &user).await?;
    let cookie = state.auth.session_cookie(&issued.token);
    let value =
        HeaderValue::from_str(&cookie).map_err(|error| Error::BadRequest(error.to_string()))?;
    let mut response = (
        StatusCode::OK,
        [(header::SET_COOKIE, value)],
        Json(BrowserSessionResponse {
            authenticated: true,
            user_id: user.user_id,
            email: user.email,
            csrf_token: issued.csrf_token,
        }),
    )
        .into_response();
    response
        .headers_mut()
        .insert(header::CACHE_CONTROL, HeaderValue::from_static("no-store"));
    Ok(response)
}

async fn logout(
    State(state): State<AppState>,
    Extension(principal): Extension<Principal>,
) -> Result<Response> {
    state
        .auth
        .revoke_session(&state.pool, principal.session_id)
        .await?;
    let cookie = state.auth.expired_session_cookie();
    let value =
        HeaderValue::from_str(&cookie).map_err(|error| Error::BadRequest(error.to_string()))?;
    let mut response = (StatusCode::NO_CONTENT, [(header::SET_COOKIE, value)]).into_response();
    response
        .headers_mut()
        .insert(header::CACHE_CONTROL, HeaderValue::from_static("no-store"));
    Ok(response)
}

async fn session(
    State(state): State<AppState>,
    Extension(principal): Extension<Principal>,
) -> Result<Response> {
    let csrf_token = state
        .auth
        .issue_csrf_token(&state.pool, principal.session_id)
        .await?;
    let mut response = Json(BrowserSessionResponse {
        authenticated: true,
        user_id: principal.subject,
        email: principal.email,
        csrf_token,
    })
    .into_response();
    response
        .headers_mut()
        .insert(header::CACHE_CONTROL, HeaderValue::from_static("no-store"));
    Ok(response)
}

async fn live(State(state): State<AppState>) -> Response {
    let _ = state;
    Json(serde_json::json!({ "status": "ok" })).into_response()
}

async fn ready(State(state): State<AppState>) -> Response {
    let database = store::ready(&state.pool).await;
    let response = (
        if database {
            StatusCode::OK
        } else {
            StatusCode::SERVICE_UNAVAILABLE
        },
        Json(serde_json::json!({
            "status": if database { "ready" } else { "not-ready" },
            "database": database
        })),
    )
        .into_response();
    let _ = state;
    response
}

async fn create_instance(
    State(state): State<AppState>,
    Extension(principal): Extension<Principal>,
    Json(request): Json<CreateAgentInstanceRequest>,
) -> Result<Response> {
    let (name, expires) = request.validated()?;
    let (result, activation_code) =
        store::create_invite(&state.pool, &name, expires, &principal.subject)
            .await
            .map_err(database)?;
    match result {
        store::CreateInviteResult::Created(summary) => {
            let mut response = (
                StatusCode::CREATED,
                Json(CreatedAgentInstance {
                    summary,
                    activation_code: activation_code.expect("created invite has code"),
                }),
            )
                .into_response();
            response
                .headers_mut()
                .insert(header::CACHE_CONTROL, HeaderValue::from_static("no-store"));
            Ok(response)
        }
        store::CreateInviteResult::Conflict => {
            Err(Error::Conflict("a pending invite already exists".into()))
        }
    }
}

async fn list_instances(
    State(state): State<AppState>,
) -> Result<Json<Vec<crate::model::AgentInstanceSummary>>> {
    Ok(Json(
        store::list_invites(&state.pool).await.map_err(database)?,
    ))
}

async fn cancel_instance(
    State(state): State<AppState>,
    Extension(principal): Extension<Principal>,
    Path(id): Path<String>,
) -> Result<StatusCode> {
    let id = canonical_uuid(&id, "agent instance request id")?;
    match store::cancel_invite(&state.pool, id, &principal.subject)
        .await
        .map_err(database)?
    {
        store::CancelInviteResult::Cancelled => Ok(StatusCode::NO_CONTENT),
        store::CancelInviteResult::NotFound => {
            Err(Error::NotFound("agent instance invite not found".into()))
        }
        store::CancelInviteResult::NotPending => Err(Error::Conflict(
            "only a pending invite can be cancelled".into(),
        )),
    }
}

async fn create_pairing(
    State(state): State<AppState>,
    Json(request): Json<AgentPairingRequest>,
) -> Result<Response> {
    validate_pairing(&request)?;
    match store::create_pairing(&state.pool, &request)
        .await
        .map_err(database)?
    {
        store::CreatePairingResult::Ready {
            request_id,
            expires_at,
            created,
        } => {
            let mut response = (
                if created {
                    StatusCode::CREATED
                } else {
                    StatusCode::OK
                },
                Json(AgentPairingResponse {
                    request_id: request_id.to_string(),
                    activation_url: activation_url(request_id),
                    expires_in: (expires_at - Utc::now()).num_seconds().max(1) as u64,
                    poll_interval: 5,
                }),
            )
                .into_response();
            response
                .headers_mut()
                .insert(header::CACHE_CONTROL, HeaderValue::from_static("no-store"));
            Ok(response)
        }
        store::CreatePairingResult::Expired => {
            Err(Error::BadRequest("pairing request expired".into()))
        }
        store::CreatePairingResult::Conflict => Err(Error::Conflict(
            "polling secret or agent token is already in use".into(),
        )),
        store::CreatePairingResult::AtCapacity => Err(Error::TooManyRequests(
            "too many pending pairing requests".into(),
        )),
    }
}

async fn pairing_public(State(state): State<AppState>, Path(id): Path<String>) -> Result<Response> {
    let id = canonical_uuid(&id, "pairing request id")?;
    let value = store::pairing_public(&state.pool, id)
        .await
        .map_err(database)?
        .ok_or_else(|| Error::NotFound("pairing request not found".into()))?;
    let mut response = Json(value).into_response();
    response
        .headers_mut()
        .insert(header::CACHE_CONTROL, HeaderValue::from_static("no-store"));
    Ok(response)
}

async fn pairing_status(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<String>,
) -> Result<Response> {
    let id = canonical_uuid(&id, "pairing request id")?;
    let secret = authorization(&headers, "pairing").ok_or(Error::Unauthorized)?;
    if !(32..=256).contains(&secret.len()) || secret.chars().any(char::is_whitespace) {
        return Err(Error::Unauthorized);
    }
    let (status, instance_id) = store::pairing_status(&state.pool, id, &crate::token_hash(secret))
        .await
        .map_err(database)?
        .ok_or(Error::Unauthorized)?;
    let mut response = Json(AgentPairingStatusResponse {
        status,
        instance_id,
    })
    .into_response();
    response
        .headers_mut()
        .insert(header::CACHE_CONTROL, HeaderValue::from_static("no-store"));
    Ok(response)
}

async fn activate_admin(
    State(state): State<AppState>,
    Extension(principal): Extension<Principal>,
    Json(request): Json<ActivateAgentRequest>,
) -> Result<Response> {
    activate(&state, request, &principal.subject).await
}

async fn activate_capability(
    State(state): State<AppState>,
    Json(request): Json<ActivateAgentRequest>,
) -> Result<Response> {
    activate(&state, request, "agent-capability").await
}

async fn activate(
    state: &AppState,
    request: ActivateAgentRequest,
    actor: &str,
) -> Result<Response> {
    let id = canonical_uuid(&request.request_id, "pairing request id")?;
    if request.activation_code.len() > 256
        || request.activation_code.chars().any(char::is_whitespace)
    {
        return Err(Error::Unauthorized);
    }
    match store::activate(
        &state.pool,
        id,
        &crate::token_hash(&request.activation_code),
        actor,
    )
    .await
    .map_err(database)?
    {
        store::ActivateResult::Active(instance) => {
            let mut response = Json(ActivateAgentResponse {
                instance_id: instance.to_string(),
                status: ActivatePairingStatus::Active,
            })
            .into_response();
            response
                .headers_mut()
                .insert(header::CACHE_CONTROL, HeaderValue::from_static("no-store"));
            Ok(response)
        }
        store::ActivateResult::NotFound => Err(Error::NotFound("pairing request not found".into())),
        store::ActivateResult::InvalidCode => Err(Error::Unauthorized),
        store::ActivateResult::Expired => Err(Error::BadRequest(
            "pairing request or activation code expired".into(),
        )),
        store::ActivateResult::Conflict => Err(Error::Conflict(
            "activation code or pairing request already used".into(),
        )),
    }
}

fn activation_url(request_id: uuid::Uuid) -> String {
    format!("/activate/{request_id}")
}

async fn report(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(report): Json<AgentReport>,
) -> Result<Response> {
    let credential = authorization(&headers, "bearer").ok_or(Error::Unauthorized)?;
    let credential_hash = crate::token_hash(credential);
    let host = store::host_for_token(&state.pool, &credential_hash)
        .await
        .map_err(database)?
        .ok_or(Error::Unauthorized)?;
    if host.to_string() != report.host.id {
        return Err(Error::Unauthorized);
    }
    let metrics = validate_report(&report)?;
    let mut buckets = state.report_buckets.lock().await;
    let allowed = buckets
        .entry(report.host.id.clone())
        .or_insert(TokenBucket {
            tokens: 64.0,
            updated: Instant::now(),
        })
        .allow();
    drop(buckets);
    if !allowed {
        return Err(Error::TooManyRequests("agent report rate exceeded".into()));
    }
    let result = store::store_report(&state.pool, &report, &credential_hash, &metrics).await;
    let (accepted, received_at) = match result {
        Ok(value) => value,
        Err(error)
            if error
                .downcast_ref::<store::ReportStoreError>()
                .is_some_and(|e| matches!(e, store::ReportStoreError::Unauthorized)) =>
        {
            return Err(Error::Unauthorized);
        }
        Err(error)
            if error
                .downcast_ref::<store::ReportStoreError>()
                .is_some_and(|e| matches!(e, store::ReportStoreError::ReportIdConflict)) =>
        {
            return Err(Error::Conflict(error.to_string()));
        }
        Err(error) => return Err(database(error)),
    };
    Ok((
        StatusCode::ACCEPTED,
        Json(AgentReportAck {
            host_id: report.host.id,
            report_id: report.report_id,
            accepted,
            received_at,
        }),
    )
        .into_response())
}

async fn list_hosts(
    State(state): State<AppState>,
    Query(query): Query<HostListQuery>,
) -> Result<Json<HostListResponse>> {
    let limit = query.limit.unwrap_or(200).clamp(1, 1000);
    let offset = query.offset.unwrap_or(0).max(0);
    let (hosts, total) = store::list_hosts(&state.pool, limit, offset)
        .await
        .map_err(database)?;
    Ok(Json(HostListResponse {
        hosts,
        total,
        limit,
        offset,
    }))
}

async fn host_detail(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<Json<HostDetailResponse>> {
    let id = canonical_uuid(&id, "host id")?;
    let (host, latest) = store::get_host(&state.pool, id)
        .await
        .map_err(database)?
        .ok_or_else(|| Error::NotFound("monitored host not found".into()))?;
    Ok(Json(HostDetailResponse { host, latest }))
}

async fn host_history(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Query(query): Query<HistoryQuery>,
) -> Result<Json<HistoryResponse>> {
    let id = canonical_uuid(&id, "host id")?;
    if query.from.zip(query.to).is_some_and(|(from, to)| from > to) {
        return Err(Error::BadRequest(
            "history from must not be after to".into(),
        ));
    }
    let points = store::history(
        &state.pool,
        id,
        query.from,
        query.to,
        query.limit.unwrap_or(300).clamp(1, 1000),
    )
    .await
    .map_err(database)?
    .ok_or_else(|| Error::NotFound("monitored host not found".into()))?;
    Ok(Json(HistoryResponse {
        host_id: id.to_string(),
        points,
    }))
}

async fn update_remark(
    State(state): State<AppState>,
    Extension(principal): Extension<Principal>,
    Path(id): Path<String>,
    Json(request): Json<UpdateMonitoringRemarkRequest>,
) -> Result<StatusCode> {
    let id = canonical_uuid(&id, "host id")?;
    let remark = request.validated()?;
    if store::update_remark(&state.pool, id, &remark, &principal.subject)
        .await
        .map_err(database)?
    {
        Ok(StatusCode::NO_CONTENT)
    } else {
        Err(Error::NotFound("monitored host not found".into()))
    }
}

async fn delete_host(
    State(state): State<AppState>,
    Extension(principal): Extension<Principal>,
    Path(id): Path<String>,
) -> Result<StatusCode> {
    let id = canonical_uuid(&id, "host id")?;
    if store::delete_host(&state.pool, id, &principal.subject)
        .await
        .map_err(database)?
    {
        Ok(StatusCode::NO_CONTENT)
    } else {
        Err(Error::NotFound("monitored host not found".into()))
    }
}

fn authorization<'a>(headers: &'a HeaderMap, expected_scheme: &str) -> Option<&'a str> {
    let value = headers.get(header::AUTHORIZATION)?.to_str().ok()?;
    let (scheme, value) = value.split_once(' ')?;
    (scheme.eq_ignore_ascii_case(expected_scheme) && !value.is_empty()).then_some(value)
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::{body::Body, http::Request};
    use tower::ServiceExt;

    async fn app() -> Router {
        let pool = sqlx::sqlite::SqlitePoolOptions::new()
            .max_connections(1)
            .connect("sqlite::memory:")
            .await
            .unwrap();
        store::migrate(&pool).await.unwrap();
        let auth = crate::auth::Auth::new(
            std::time::Duration::from_secs(60),
            std::time::Duration::from_secs(600),
            crate::auth::CookieMode::LoopbackDevelopment,
        )
        .unwrap();
        router(AppState::new(pool, auth))
    }

    async fn app_with_admin(email: &str, password: &str) -> Router {
        let pool = sqlx::sqlite::SqlitePoolOptions::new()
            .max_connections(1)
            .connect("sqlite::memory:")
            .await
            .unwrap();
        store::migrate(&pool).await.unwrap();
        store::ensure_admin_user(&pool, email, Some(password))
            .await
            .unwrap();
        let auth = crate::auth::Auth::new(
            std::time::Duration::from_secs(60),
            std::time::Duration::from_secs(600),
            crate::auth::CookieMode::LoopbackDevelopment,
        )
        .unwrap();
        router(AppState::new(pool, auth))
    }

    #[test]
    fn pairing_activation_url_targets_the_dynamic_host_module() {
        let request_id = uuid::Uuid::parse_str("00000000-0000-4000-8000-000000000001").unwrap();
        assert_eq!(
            activation_url(request_id),
            "/activate/00000000-0000-4000-8000-000000000001"
        );
    }

    #[tokio::test]
    async fn health_is_public_and_console_routes_require_a_session_cookie() {
        assert_eq!(
            app()
                .await
                .oneshot(Request::get("/health/live").body(Body::empty()).unwrap())
                .await
                .unwrap()
                .status(),
            StatusCode::OK
        );
        assert_eq!(
            app()
                .await
                .oneshot(
                    Request::get("/api/monitoring/hosts")
                        .body(Body::empty())
                        .unwrap()
                )
                .await
                .unwrap()
                .status(),
            StatusCode::UNAUTHORIZED
        );
    }

    #[tokio::test]
    async fn login_route_is_public() {
        let response = app_with_admin("admin@example.com", "correct-password")
            .await
            .oneshot(
                Request::post("/api/v1/auth/login")
                    .header(header::CONTENT_TYPE, "application/json")
                    .body(Body::from(
                        r#"{"email":"admin@example.com","password":"correct-password"}"#,
                    ))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);
        assert!(response.headers().contains_key(header::SET_COOKIE));
    }

    #[test]
    fn csrf_is_required_for_every_unsafe_console_method() {
        for method in [Method::POST, Method::PUT, Method::PATCH, Method::DELETE] {
            assert!(requires_csrf(&method));
        }
        for method in [Method::GET, Method::HEAD, Method::OPTIONS] {
            assert!(!requires_csrf(&method));
        }
    }
}

use std::{
    collections::HashMap,
    net::SocketAddr,
    path::PathBuf,
    sync::Arc,
    time::{Duration, Instant},
};

use axum::{
    Json, Router,
    extract::{ConnectInfo, DefaultBodyLimit, Extension, Path, Query, Request, State},
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
    telemetry::{
        TelemetrySubmitError, TelemetryWriter, TelemetryWriterConfig, TelemetryWriterTask,
    },
};

#[derive(Clone)]
pub struct AppState {
    pub pool: sqlx::SqlitePool,
    pub auth: crate::auth::Auth,
    login_admission: crate::login::LoginAdmission,
    pairing_admission: crate::pairing_admission::PairingAdmission,
    report_buckets: Arc<Mutex<ReportBuckets>>,
    telemetry: TelemetryWriter,
}

impl AppState {
    #[cfg(test)]
    pub fn new(pool: sqlx::SqlitePool, auth: crate::auth::Auth) -> Self {
        Self::with_telemetry_config(pool, auth, TelemetryWriterConfig::production()).0
    }

    pub fn with_telemetry_config(
        pool: sqlx::SqlitePool,
        auth: crate::auth::Auth,
        config: TelemetryWriterConfig,
    ) -> (Self, TelemetryWriterTask) {
        let (telemetry, task) = TelemetryWriter::start(pool.clone(), config);
        (Self::with_telemetry_writer(pool, auth, telemetry), task)
    }

    pub fn with_telemetry_writer(
        pool: sqlx::SqlitePool,
        auth: crate::auth::Auth,
        telemetry: TelemetryWriter,
    ) -> Self {
        Self {
            pool,
            auth,
            login_admission: crate::login::LoginAdmission::production(),
            pairing_admission: crate::pairing_admission::PairingAdmission::production(),
            report_buckets: Arc::new(Mutex::new(ReportBuckets::production())),
            telemetry,
        }
    }

    #[cfg(test)]
    fn with_login_admission(
        pool: sqlx::SqlitePool,
        auth: crate::auth::Auth,
        login_admission: crate::login::LoginAdmission,
    ) -> Self {
        let mut state = Self::new(pool, auth);
        state.login_admission = login_admission;
        state
    }

    #[cfg(test)]
    fn with_pairing_admission(
        pool: sqlx::SqlitePool,
        auth: crate::auth::Auth,
        pairing_admission: crate::pairing_admission::PairingAdmission,
    ) -> Self {
        let mut state = Self::new(pool, auth);
        state.pairing_admission = pairing_admission;
        state
    }
}

const REPORT_BUCKET_BURST: f64 = 64.0;
const REPORT_BUCKET_REFILL_PER_SECOND: f64 = 16.0;
const REPORT_BUCKET_CAPACITY: usize = 16_384;
const REPORT_BUCKET_TTL: Duration = Duration::from_secs(15 * 60);

struct TokenBucket {
    tokens: f64,
    updated: Instant,
    last_seen: Instant,
}

impl TokenBucket {
    fn full(now: Instant) -> Self {
        Self {
            tokens: REPORT_BUCKET_BURST,
            updated: now,
            last_seen: now,
        }
    }

    fn tokens_at(&self, now: Instant) -> f64 {
        (self.tokens
            + now.saturating_duration_since(self.updated).as_secs_f64()
                * REPORT_BUCKET_REFILL_PER_SECOND)
            .min(REPORT_BUCKET_BURST)
    }

    fn allow_at(&mut self, now: Instant) -> std::result::Result<(), Duration> {
        self.tokens = self.tokens_at(now);
        self.updated = now;
        self.last_seen = now;
        if self.tokens < 1.0 {
            return Err(Duration::from_secs_f64(
                (1.0 - self.tokens) / REPORT_BUCKET_REFILL_PER_SECOND,
            ));
        }
        self.tokens -= 1.0;
        Ok(())
    }
}

struct ReportBuckets {
    entries: HashMap<String, TokenBucket>,
    capacity: usize,
    entry_ttl: Duration,
}

impl ReportBuckets {
    fn production() -> Self {
        Self::new(REPORT_BUCKET_CAPACITY, REPORT_BUCKET_TTL)
    }

    fn new(capacity: usize, entry_ttl: Duration) -> Self {
        assert!(capacity > 0);
        assert!(!entry_ttl.is_zero());
        Self {
            entries: HashMap::new(),
            capacity,
            entry_ttl,
        }
    }

    fn allow(&mut self, host_id: &str) -> std::result::Result<(), Duration> {
        self.allow_at(host_id, Instant::now())
    }

    fn allow_at(&mut self, host_id: &str, now: Instant) -> std::result::Result<(), Duration> {
        self.entries
            .retain(|_, entry| now.saturating_duration_since(entry.last_seen) < self.entry_ttl);
        if !self.entries.contains_key(host_id) {
            self.make_room(now)?;
            self.entries
                .insert(host_id.to_owned(), TokenBucket::full(now));
        }
        self.entries
            .get_mut(host_id)
            .expect("the report bucket exists")
            .allow_at(now)
    }

    fn make_room(&mut self, now: Instant) -> std::result::Result<(), Duration> {
        if self.entries.len() < self.capacity {
            return Ok(());
        }
        let evictable = self
            .entries
            .iter()
            .filter(|(_, entry)| entry.tokens_at(now) >= REPORT_BUCKET_BURST)
            .min_by_key(|(_, entry)| entry.last_seen)
            .map(|(host_id, _)| host_id.clone());
        if let Some(host_id) = evictable {
            self.entries.remove(&host_id);
            return Ok(());
        }
        let retry = self
            .entries
            .values()
            .map(|entry| {
                Duration::from_secs_f64(
                    (REPORT_BUCKET_BURST - entry.tokens_at(now)).max(0.0)
                        / REPORT_BUCKET_REFILL_PER_SECOND,
                )
            })
            .min()
            .unwrap_or(self.entry_ttl);
        Err(retry.max(Duration::from_nanos(1)))
    }
}

pub fn router(state: AppState, static_dir: PathBuf) -> Router {
    let public_auth = Router::new()
        .route("/api/v1/auth/login", post(login))
        .layer(DefaultBodyLimit::max(crate::login::LOGIN_BODY_LIMIT_BYTES))
        .route_layer(middleware::from_fn_with_state(
            state.clone(),
            login_source_admission,
        ));

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
        .route(
            host_protocol::AGENT_ADMIN_ACTIVATE_PATH,
            post(activate_admin),
        )
        .layer(DefaultBodyLimit::max(16 * 1024))
        .route_layer(middleware::from_fn_with_state(
            state.clone(),
            console_admission,
        ));
    let agent = Router::new()
        .route(host_protocol::AGENT_REPORT_PATH, post(report))
        .route(
            host_protocol::AGENT_PAIRING_REQUESTS_PATH,
            post(create_pairing),
        )
        .route(
            host_protocol::AGENT_PAIRING_REQUEST_PATH,
            get(pairing_public),
        )
        .route(
            host_protocol::AGENT_PAIRING_STATUS_PATH,
            post(pairing_status),
        )
        .route(
            host_protocol::AGENT_ACTIVATE_PATH,
            post(activate_capability),
        )
        .layer(DefaultBodyLimit::max(AGENT_REPORT_MAX_BODY_BYTES));
    Router::new()
        .route("/health", get(live))
        .route("/health/live", get(live))
        .route("/health/ready", get(ready))
        .merge(public_auth)
        .merge(protected_auth)
        .merge(console)
        .merge(agent)
        .fallback_service(ServeDir::new(static_dir))
        .with_state(state)
}

async fn login_source_admission(
    State(state): State<AppState>,
    request: Request,
    next: Next,
) -> Result<Response> {
    // This is the transport peer installed by Axum's make-service. Forwarded
    // headers are intentionally not trusted without an explicit proxy policy.
    let peer_ip = request
        .extensions()
        .get::<ConnectInfo<SocketAddr>>()
        .map(|connect| connect.0.ip())
        .ok_or(Error::Forbidden)?;
    state.login_admission.check_source(peer_ip)?;
    Ok(next.run(request).await)
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
    let normalized_email = store::normalize_user_email(&request.email);
    state.login_admission.check_account(&normalized_email)?;
    let user = store::find_active_user_by_email(&state.pool, &normalized_email)
        .await
        .map_err(database)?;
    let user = state
        .login_admission
        .verify_user(user, request.password)
        .await?
        .ok_or(Error::Unauthorized)?;
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
    let retention_schema = store::retention_ready(&state.pool).await;
    let telemetry_writer = !state.telemetry.is_closed();
    let ready = database && retention_schema && telemetry_writer;
    (
        if ready {
            StatusCode::OK
        } else {
            StatusCode::SERVICE_UNAVAILABLE
        },
        Json(serde_json::json!({
            "status": if ready { "ready" } else { "not-ready" },
            "database": database,
            "retention_schema": retention_schema,
            "telemetry_writer": telemetry_writer
        })),
    )
        .into_response()
}

async fn create_instance(
    State(state): State<AppState>,
    Extension(principal): Extension<Principal>,
    Json(request): Json<CreateAgentInstanceRequest>,
) -> Result<Response> {
    state
        .pairing_admission
        .check_invite_account(&principal.subject)?;
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
    ConnectInfo(peer): ConnectInfo<SocketAddr>,
    Json(request): Json<AgentPairingRequest>,
) -> Result<Response> {
    validate_pairing(&request)?;
    state
        .pairing_admission
        .check_create(peer.ip(), &request.host.id)?;
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
        store::CreatePairingResult::AtCapacity => Err(Error::RateLimited {
            message: "too many pending pairing requests",
            retry_after: 60,
        }),
        store::CreatePairingResult::DeviceAtCapacity => Err(Error::RateLimited {
            message: "too many pending pairing requests for this device",
            retry_after: 60,
        }),
    }
}

async fn pairing_public(
    State(state): State<AppState>,
    ConnectInfo(peer): ConnectInfo<SocketAddr>,
    Path(id): Path<String>,
) -> Result<Response> {
    let id = canonical_uuid(&id, "pairing request id")?;
    state.pairing_admission.check_poll(peer.ip(), id)?;
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
    ConnectInfo(peer): ConnectInfo<SocketAddr>,
    headers: HeaderMap,
    Path(id): Path<String>,
) -> Result<Response> {
    let id = canonical_uuid(&id, "pairing request id")?;
    state.pairing_admission.check_poll(peer.ip(), id)?;
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
    ConnectInfo(peer): ConnectInfo<SocketAddr>,
    Extension(principal): Extension<Principal>,
    Json(request): Json<ActivateAgentRequest>,
) -> Result<Response> {
    state
        .pairing_admission
        .check_invite_account(&principal.subject)?;
    activate(&state, peer.ip(), request, &principal.subject).await
}

async fn activate_capability(
    State(state): State<AppState>,
    ConnectInfo(peer): ConnectInfo<SocketAddr>,
    Json(request): Json<ActivateAgentRequest>,
) -> Result<Response> {
    activate(&state, peer.ip(), request, "agent-capability").await
}

async fn activate(
    state: &AppState,
    source: std::net::IpAddr,
    request: ActivateAgentRequest,
    actor: &str,
) -> Result<Response> {
    let id = canonical_uuid(&request.request_id, "pairing request id")?;
    state.pairing_admission.check_activation(source, id)?;
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
    format!(
        "{}{request_id}",
        host_protocol::BROWSER_ACTIVATION_PATH_PREFIX
    )
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
    let admission = buckets.allow(&report.host.id);
    drop(buckets);
    if let Err(delay) = admission {
        return Err(Error::RateLimited {
            message: "agent report rate exceeded",
            retry_after: delay
                .as_secs()
                .saturating_add(u64::from(delay.subsec_nanos() != 0))
                .max(1),
        });
    }
    let host_id = report.host.id.clone();
    let report_id = report.report_id.clone();
    let result = state
        .telemetry
        .submit(store::ReportWrite::new(report, credential_hash, metrics))
        .await;
    let (accepted, received_at) = match result {
        Ok(value) => value,
        Err(TelemetrySubmitError::QueueFull) => {
            return Err(Error::RateLimited {
                message: "telemetry queue is full",
                retry_after: 1,
            });
        }
        Err(TelemetrySubmitError::WriterUnavailable) => {
            return Err(Error::RetryableUnavailable {
                message: "telemetry writer is unavailable",
                retry_after: 1,
            });
        }
        Err(TelemetrySubmitError::ResponseDeadline) => {
            return Err(Error::RetryableUnavailable {
                message: "telemetry persistence exceeded its response deadline",
                retry_after: 1,
            });
        }
        Err(error) if error.is_unauthorized() => return Err(Error::Unauthorized),
        Err(error) if error.is_report_id_conflict() => {
            return Err(Error::Conflict(
                "report_id already belongs to another host".into(),
            ));
        }
        Err(error) => {
            tracing::warn!(
                %host_id,
                %report_id,
                error = %error,
                "telemetry writer could not persist a validated report"
            );
            return Err(Error::RetryableUnavailable {
                message: "telemetry persistence is unavailable",
                retry_after: 1,
            });
        }
    };
    Ok((
        StatusCode::ACCEPTED,
        Json(AgentReportAck {
            host_id,
            report_id,
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
    use http_body_util::BodyExt;
    use tower::ServiceExt;

    fn test_static_dir() -> PathBuf {
        PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("web")
    }

    async fn app() -> Router {
        let pool = sqlx::sqlite::SqlitePoolOptions::new()
            .max_connections(1)
            .connect("sqlite::memory:")
            .await
            .unwrap();
        store::initialize_empty(&pool).await.unwrap();
        let auth = crate::auth::Auth::new(
            std::time::Duration::from_secs(60),
            std::time::Duration::from_secs(600),
            crate::auth::CookieMode::LoopbackDevelopment,
        )
        .unwrap();
        router(AppState::new(pool, auth), test_static_dir())
    }

    async fn app_with_admin(email: &str, password: &str) -> Router {
        app_with_admin_and_admission(email, password, crate::login::LoginAdmission::production())
            .await
            .0
    }

    async fn app_with_pairing_admission(
        pairing_admission: crate::pairing_admission::PairingAdmission,
    ) -> Router {
        let pool = sqlx::sqlite::SqlitePoolOptions::new()
            .max_connections(1)
            .connect("sqlite::memory:")
            .await
            .unwrap();
        store::initialize_empty(&pool).await.unwrap();
        let auth = crate::auth::Auth::new(
            std::time::Duration::from_secs(60),
            std::time::Duration::from_secs(600),
            crate::auth::CookieMode::LoopbackDevelopment,
        )
        .unwrap();
        router(
            AppState::with_pairing_admission(pool, auth, pairing_admission),
            test_static_dir(),
        )
    }

    async fn app_with_admin_and_admission(
        email: &str,
        password: &str,
        login_admission: crate::login::LoginAdmission,
    ) -> (Router, sqlx::SqlitePool) {
        let pool = sqlx::sqlite::SqlitePoolOptions::new()
            .max_connections(1)
            .connect("sqlite::memory:")
            .await
            .unwrap();
        store::initialize_empty(&pool).await.unwrap();
        store::ensure_admin_user(&pool, email, Some(password))
            .await
            .unwrap();
        let auth = crate::auth::Auth::new(
            std::time::Duration::from_secs(60),
            std::time::Duration::from_secs(600),
            crate::auth::CookieMode::LoopbackDevelopment,
        )
        .unwrap();
        (
            router(
                AppState::with_login_admission(pool.clone(), auth, login_admission),
                test_static_dir(),
            ),
            pool,
        )
    }

    fn login_request(body: impl Into<Body>, peer: &str) -> Request<Body> {
        let mut request = Request::post("/api/v1/auth/login")
            .header(header::CONTENT_TYPE, "application/json")
            .body(body.into())
            .unwrap();
        request.extensions_mut().insert(ConnectInfo(
            peer.parse::<SocketAddr>().expect("test peer address"),
        ));
        request
    }

    fn pairing_request(host_id: uuid::Uuid, peer: &str, nonce: char) -> Request<Body> {
        let body = serde_json::json!({
            "host": {
                "id": host_id,
                "os": "linux",
                "os_version": "test",
                "kernel_version": "test",
                "arch": "x86_64",
                "agent_version": env!("CARGO_PKG_VERSION")
            },
            "token_hash": nonce.to_string().repeat(64),
            "polling_secret_hash": if nonce == 'a' { "b".repeat(64) } else { "c".repeat(64) }
        });
        let mut request = Request::post(host_protocol::AGENT_PAIRING_REQUESTS_PATH)
            .header(header::CONTENT_TYPE, "application/json")
            .body(Body::from(body.to_string()))
            .unwrap();
        request.extensions_mut().insert(ConnectInfo(
            peer.parse::<SocketAddr>().expect("test peer address"),
        ));
        request
    }

    async fn body_bytes(response: Response) -> Vec<u8> {
        response
            .into_body()
            .collect()
            .await
            .expect("collect response body")
            .to_bytes()
            .to_vec()
    }

    #[test]
    fn pairing_activation_url_targets_the_current_application() {
        let request_id = uuid::Uuid::parse_str("00000000-0000-4000-8000-000000000001").unwrap();
        assert_eq!(
            activation_url(request_id),
            "/activate/00000000-0000-4000-8000-000000000001"
        );
    }

    #[test]
    fn report_rate_state_is_bounded_expires_and_does_not_reset_depleted_hosts() {
        let now = Instant::now();
        let mut buckets = ReportBuckets::new(1, Duration::from_secs(10));
        for _ in 0..REPORT_BUCKET_BURST as usize {
            buckets.allow_at("host-a", now).unwrap();
        }
        assert!(buckets.allow_at("host-a", now).is_err());
        assert!(
            buckets.allow_at("host-b", now).is_err(),
            "identifier rotation must not evict a depleted active bucket"
        );
        assert_eq!(buckets.entries.len(), 1);
        assert!(buckets.entries.contains_key("host-a"));

        buckets
            .allow_at("host-b", now + Duration::from_secs(4))
            .unwrap();
        assert_eq!(buckets.entries.len(), 1);
        assert!(buckets.entries.contains_key("host-b"));

        buckets
            .allow_at("host-c", now + Duration::from_secs(15))
            .unwrap();
        assert_eq!(buckets.entries.len(), 1);
        assert!(buckets.entries.contains_key("host-c"));
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
            .oneshot(login_request(
                r#"{"email":"admin@example.com","password":"correct-password"}"#,
                "192.0.2.10:41000",
            ))
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);
        assert!(response.headers().contains_key(header::SET_COOKIE));
    }

    #[tokio::test]
    async fn login_json_body_is_bounded_before_password_work() {
        let body = format!(
            r#"{{"email":"admin@example.com","password":"{}"}}"#,
            "x".repeat(crate::login::LOGIN_BODY_LIMIT_BYTES)
        );
        let response = app()
            .await
            .oneshot(login_request(body, "192.0.2.20:41000"))
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::PAYLOAD_TOO_LARGE);
    }

    #[tokio::test]
    async fn source_rate_limit_returns_retry_after() {
        let admission =
            crate::login::LoginAdmission::for_test(1, 8, 1, std::time::Duration::from_millis(50));
        let (app, _) =
            app_with_admin_and_admission("admin@example.com", "correct-password", admission).await;
        let first = app
            .clone()
            .oneshot(login_request("{", "192.0.2.30:41000"))
            .await
            .unwrap();
        assert_ne!(first.status(), StatusCode::TOO_MANY_REQUESTS);

        let limited = app
            .oneshot(login_request(
                r#"{"email":"other@example.com","password":"wrong-password"}"#,
                "192.0.2.30:41001",
            ))
            .await
            .unwrap();
        assert_eq!(limited.status(), StatusCode::TOO_MANY_REQUESTS);
        let retry_after = limited.headers()[header::RETRY_AFTER]
            .to_str()
            .unwrap()
            .parse::<u64>()
            .unwrap();
        assert!((1..=60).contains(&retry_after));
    }

    #[tokio::test]
    async fn normalized_account_limit_spans_distinct_sources() {
        let admission =
            crate::login::LoginAdmission::for_test(8, 1, 1, std::time::Duration::from_secs(1));
        let (app, _) =
            app_with_admin_and_admission("admin@example.com", "correct-password", admission).await;
        let first = app
            .clone()
            .oneshot(login_request(
                r#"{"email":" Admin@Example.COM ","password":"wrong-password"}"#,
                "192.0.2.31:41000",
            ))
            .await
            .unwrap();
        assert_eq!(first.status(), StatusCode::UNAUTHORIZED);

        let limited = app
            .oneshot(login_request(
                r#"{"email":"admin@example.com","password":"wrong-password"}"#,
                "192.0.2.32:41000",
            ))
            .await
            .unwrap();
        assert_eq!(limited.status(), StatusCode::TOO_MANY_REQUESTS);
        let retry_after = limited.headers()[header::RETRY_AFTER]
            .to_str()
            .unwrap()
            .parse::<u64>()
            .unwrap();
        assert!((1..=60).contains(&retry_after));
    }

    #[tokio::test]
    async fn pairing_source_limit_precedes_sqlite_and_returns_retry_after() {
        let admission = crate::pairing_admission::PairingAdmission::for_test(
            1,
            8,
            std::time::Duration::from_secs(300),
        );
        let app = app_with_pairing_admission(admission).await;
        let first = app
            .clone()
            .oneshot(pairing_request(
                uuid::Uuid::new_v4(),
                "192.0.2.50:41000",
                'a',
            ))
            .await
            .unwrap();
        assert_eq!(first.status(), StatusCode::CREATED);

        let limited = app
            .oneshot(pairing_request(
                uuid::Uuid::new_v4(),
                "192.0.2.50:41001",
                'd',
            ))
            .await
            .unwrap();
        assert_eq!(limited.status(), StatusCode::TOO_MANY_REQUESTS);
        assert!(
            limited.headers()[header::RETRY_AFTER]
                .to_str()
                .unwrap()
                .parse::<u64>()
                .unwrap()
                >= 1
        );
        assert_eq!(
            body_bytes(limited).await,
            br#"{"message":"pairing source rate exceeded"}"#
        );
    }

    #[tokio::test]
    async fn unknown_wrong_and_disabled_users_share_the_unauthorized_semantics() {
        let (app, pool) = app_with_admin_and_admission(
            "admin@example.com",
            "correct-password",
            crate::login::LoginAdmission::production(),
        )
        .await;
        let cases = [
            (
                r#"{"email":"admin@example.com","password":"wrong-password"}"#,
                "192.0.2.40:41000",
            ),
            (
                r#"{"email":"missing@example.com","password":"wrong-password"}"#,
                "192.0.2.41:41000",
            ),
        ];
        for (body, peer) in cases {
            let response = app
                .clone()
                .oneshot(login_request(body, peer))
                .await
                .unwrap();
            assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
            assert_eq!(body_bytes(response).await, br#"{"message":"unauthorized"}"#);
        }

        sqlx::query("UPDATE auth_users SET active=false WHERE email=?")
            .bind("admin@example.com")
            .execute(&pool)
            .await
            .unwrap();
        let disabled = app
            .oneshot(login_request(
                r#"{"email":"admin@example.com","password":"correct-password"}"#,
                "192.0.2.42:41000",
            ))
            .await
            .unwrap();
        assert_eq!(disabled.status(), StatusCode::UNAUTHORIZED);
        assert_eq!(body_bytes(disabled).await, br#"{"message":"unauthorized"}"#);
        let sessions: i64 = sqlx::query_scalar("SELECT count(*) FROM auth_sessions")
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(sessions, 0);
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

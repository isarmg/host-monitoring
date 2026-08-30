use std::{
    path::PathBuf,
    time::{Duration, Instant},
};

use axum::{
    Router,
    body::Body,
    http::{Request, StatusCode, header},
};
use chrono::{DateTime, Utc};
use host_monitoring_server::{
    auth::{Auth, CookieMode},
    http::{AppState, router},
    model,
    store::{self, ReportStoreError, ReportWrite},
    telemetry::{TelemetrySubmitError, TelemetryWriter, TelemetryWriterConfig},
    token_hash,
};
use host_protocol::{
    AgentHealth, AgentReport, Capability, CpuSnapshot, HostIdentity, MemorySnapshot, SystemSnapshot,
};
use sqlx::{Sqlite, SqlitePool, pool::PoolConnection};
use tempfile::TempDir;
use tokio::task::JoinSet;
use tower::ServiceExt;
use uuid::Uuid;

struct TestDatabase {
    _directory: TempDir,
    database_url: String,
    pool: SqlitePool,
}

impl TestDatabase {
    async fn new() -> Self {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("telemetry.sqlite3");
        let database_url = format!("sqlite://{}", path.display());
        let pool = store::open_or_initialize(&database_url).await.unwrap();
        Self {
            _directory: directory,
            database_url,
            pool,
        }
    }

    async fn add_host(&self, name: &str) -> (Uuid, String) {
        let host_id = Uuid::new_v4();
        let token = format!("agent-token-{host_id}");
        let hash = token_hash(&token);
        let now = Utc::now();
        sqlx::query(
            r#"INSERT INTO monitored_hosts(
                   host_id,name,os,arch,agent_version,capabilities,
                   registered_at,last_seen_at,lifecycle_status
               ) VALUES(?,?,'linux','x86_64','test','[]',?,?,'active')"#,
        )
        .bind(host_id)
        .bind(name)
        .bind(now)
        .bind(now)
        .execute(&self.pool)
        .await
        .unwrap();
        sqlx::query(
            "INSERT INTO agent_credentials(credential_id,host_id,token_hash,issued_at) \
             VALUES(?,?,?,?)",
        )
        .bind(Uuid::new_v4())
        .bind(host_id)
        .bind(&hash)
        .bind(now)
        .execute(&self.pool)
        .await
        .unwrap();
        (host_id, token)
    }
}

fn config(
    queue: usize,
    batch: usize,
    flush_ms: u64,
    enqueue_ms: u64,
    request_ms: u64,
    drain_ms: u64,
) -> TelemetryWriterConfig {
    TelemetryWriterConfig::new(
        queue,
        batch,
        Duration::from_millis(flush_ms),
        Duration::from_millis(enqueue_ms),
        Duration::from_millis(request_ms),
        Duration::from_millis(drain_ms),
    )
    .unwrap()
}

fn report(host_id: Uuid, report_id: Uuid, collected_at: DateTime<Utc>) -> AgentReport {
    AgentReport {
        schema_version: host_protocol::AGENT_REPORT_SCHEMA_VERSION,
        report_id: report_id.to_string(),
        collected_at,
        host: HostIdentity {
            id: host_id.to_string(),
            os: "linux".into(),
            os_version: Some("test-os".into()),
            kernel_version: Some("test-kernel".into()),
            arch: "x86_64".into(),
            agent_version: env!("CARGO_PKG_VERSION").into(),
        },
        interval_seconds: 10.0,
        system: SystemSnapshot {
            uptime_seconds: 60,
            cpu: CpuSnapshot {
                usage_percent: 42.5,
                logical_count: 1,
                physical_count: Some(1),
                per_core_percent: vec![42.5],
            },
            memory: MemorySnapshot {
                total_bytes: 1_000,
                used_bytes: 250,
                available_bytes: 750,
                swap_total_bytes: 0,
                swap_used_bytes: 0,
            },
            networks: vec![],
            disks: vec![],
            temperatures: vec![],
            gpus: vec![],
        },
        capabilities: vec![Capability::available("cpu", "test")],
        agent: AgentHealth {
            spool_pending_batches: 0,
            collector_errors: 0,
        },
    }
}

fn write(report: AgentReport, token: &str) -> ReportWrite {
    let metrics = model::validate_report(&report).unwrap();
    ReportWrite::new(report, token_hash(token), metrics)
}

fn report_request(token: &str, report: &AgentReport) -> Request<Body> {
    Request::post("/api/v2/agent/report")
        .header(header::AUTHORIZATION, format!("Bearer {token}"))
        .header(header::CONTENT_TYPE, "application/json")
        .body(Body::from(serde_json::to_vec(report).unwrap()))
        .unwrap()
}

fn application(pool: SqlitePool, writer: TelemetryWriter) -> Router {
    let auth = Auth::new(
        Duration::from_secs(60),
        Duration::from_secs(600),
        CookieMode::LoopbackDevelopment,
    )
    .unwrap();
    router(
        AppState::with_telemetry_writer(pool, auth, writer),
        PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("web"),
    )
}

async fn begin_write_lock(pool: &SqlitePool) -> PoolConnection<Sqlite> {
    let mut connection = pool.acquire().await.unwrap();
    sqlx::query("BEGIN IMMEDIATE")
        .execute(&mut *connection)
        .await
        .unwrap();
    connection
}

async fn release_write_lock(mut connection: PoolConnection<Sqlite>) {
    sqlx::query("COMMIT")
        .execute(&mut *connection)
        .await
        .unwrap();
}

async fn wait_until(mut condition: impl FnMut() -> bool) {
    tokio::time::timeout(Duration::from_secs(2), async {
        while !condition() {
            tokio::time::sleep(Duration::from_millis(5)).await;
        }
    })
    .await
    .expect("condition did not become true");
}

#[tokio::test]
async fn router_authentication_binding_body_and_validation_all_precede_enqueue() {
    let database = TestDatabase::new().await;
    let (host_id, token) = database.add_host("trust-boundary-host").await;
    let (other_host, _) = database.add_host("other-host").await;
    let (writer, task) =
        TelemetryWriter::start(database.pool.clone(), config(8, 4, 5, 10, 1_000, 1_000));
    let app = application(database.pool.clone(), writer.clone());

    let valid = report(host_id, Uuid::new_v4(), Utc::now());
    let unauthorized = app
        .clone()
        .oneshot(report_request("wrong-agent-token", &valid))
        .await
        .unwrap();
    assert_eq!(unauthorized.status(), StatusCode::UNAUTHORIZED);

    let wrong_binding = app
        .clone()
        .oneshot(report_request(
            &token,
            &report(other_host, Uuid::new_v4(), Utc::now()),
        ))
        .await
        .unwrap();
    assert_eq!(wrong_binding.status(), StatusCode::UNAUTHORIZED);

    let mut invalid = valid.clone();
    invalid.interval_seconds = 0.0;
    let invalid = app
        .clone()
        .oneshot(report_request(&token, &invalid))
        .await
        .unwrap();
    assert_eq!(invalid.status(), StatusCode::BAD_REQUEST);

    let oversized = app
        .clone()
        .oneshot(
            Request::post("/api/v2/agent/report")
                .header(header::AUTHORIZATION, format!("Bearer {token}"))
                .header(header::CONTENT_TYPE, "application/json")
                .body(Body::from(vec![
                    b' ';
                    host_protocol::AGENT_REPORT_MAX_BODY_BYTES
                        + 1
                ]))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(oversized.status(), StatusCode::PAYLOAD_TOO_LARGE);
    assert_eq!(writer.stats().enqueued, 0);

    let accepted = app.oneshot(report_request(&token, &valid)).await.unwrap();
    assert_eq!(accepted.status(), StatusCode::ACCEPTED);
    assert_eq!(writer.stats().enqueued, 1);
    task.shutdown().await.unwrap();
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn concurrent_reports_are_batched_and_acknowledged_after_commit() {
    let database = TestDatabase::new().await;
    let (host_id, token) = database.add_host("batched-host").await;
    let (writer, task) =
        TelemetryWriter::start(database.pool.clone(), config(64, 16, 75, 10, 2_000, 2_000));
    let mut submissions = JoinSet::new();
    for offset in 0..12 {
        let writer = writer.clone();
        let token = token.clone();
        let item = report(
            host_id,
            Uuid::new_v4(),
            Utc::now() - chrono::Duration::milliseconds(100 - offset),
        );
        submissions.spawn(async move { writer.submit(write(item, &token)).await });
    }
    while let Some(result) = submissions.join_next().await {
        assert!(result.unwrap().unwrap().0);
    }

    let stats = writer.stats();
    assert_eq!(stats.completed, 12);
    assert!(
        stats.largest_batch >= 2,
        "reports were not batched: {stats:?}"
    );
    assert!(
        stats.batches < 12,
        "every report used its own batch: {stats:?}"
    );
    let stored: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM agent_metric_reports")
        .fetch_one(&database.pool)
        .await
        .unwrap();
    assert_eq!(stored, 12);
    task.shutdown().await.unwrap();
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn report_conflict_and_authentication_race_are_isolated_inside_one_batch() {
    let database = TestDatabase::new().await;
    let (host_a, token_a) = database.add_host("host-a").await;
    let (host_b, token_b) = database.add_host("host-b").await;
    let shared_id = Uuid::new_v4();
    let seeded = report(host_a, shared_id, Utc::now() - chrono::Duration::seconds(2));
    let seeded_metrics = model::validate_report(&seeded).unwrap();
    store::store_report(
        &database.pool,
        &seeded,
        &token_hash(&token_a),
        &seeded_metrics,
    )
    .await
    .unwrap();

    let (writer, task) =
        TelemetryWriter::start(database.pool.clone(), config(16, 8, 100, 10, 2_000, 2_000));
    let conflict = report(host_b, shared_id, Utc::now() - chrono::Duration::seconds(1));
    let unauthorized = report(host_b, Uuid::new_v4(), Utc::now());
    let valid_id = Uuid::new_v4();
    let valid = report(host_b, valid_id, Utc::now());

    let conflict_task = {
        let writer = writer.clone();
        let token = token_b.clone();
        tokio::spawn(async move { writer.submit(write(conflict, &token)).await })
    };
    let unauthorized_task = {
        let writer = writer.clone();
        tokio::spawn(async move {
            writer
                .submit(write(unauthorized, "credential-revoked-before-write"))
                .await
        })
    };
    let valid_task = {
        let writer = writer.clone();
        let token = token_b.clone();
        tokio::spawn(async move { writer.submit(write(valid, &token)).await })
    };

    let conflict = conflict_task.await.unwrap().unwrap_err();
    let unauthorized = unauthorized_task.await.unwrap().unwrap_err();
    assert!(conflict.is_report_id_conflict());
    assert!(unauthorized.is_unauthorized());
    assert!(valid_task.await.unwrap().unwrap().0);
    let stats = writer.stats();
    assert_eq!((stats.completed, stats.failed), (1, 2));
    assert_eq!(stats.largest_batch, 3, "items did not share one batch");

    let owner: Uuid =
        sqlx::query_scalar("SELECT host_id FROM agent_metric_reports WHERE report_id=?")
            .bind(shared_id)
            .fetch_one(&database.pool)
            .await
            .unwrap();
    assert_eq!(owner, host_a);
    let valid_stored: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM agent_metric_reports WHERE report_id=?")
            .bind(valid_id)
            .fetch_one(&database.pool)
            .await
            .unwrap();
    assert_eq!(valid_stored, 1, "a rejected peer poisoned the valid report");
    task.shutdown().await.unwrap();
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn cancelled_waiter_remains_tracked_and_shutdown_drains_queued_work() {
    let database = TestDatabase::new().await;
    let (host_id, token) = database.add_host("cancelled-waiter").await;
    let blocker = begin_write_lock(&database.pool).await;
    let (writer, task) =
        TelemetryWriter::start(database.pool.clone(), config(4, 1, 1, 10, 5_000, 2_000));
    let report_id = Uuid::new_v4();
    let submission = {
        let writer = writer.clone();
        tokio::spawn(async move {
            writer
                .submit(write(report(host_id, report_id, Utc::now()), &token))
                .await
        })
    };
    wait_until(|| writer.stats().enqueued == 1).await;
    tokio::time::sleep(Duration::from_millis(30)).await;
    submission.abort();
    let _ = submission.await;
    release_write_lock(blocker).await;
    task.shutdown().await.unwrap();

    let stored: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM agent_metric_reports WHERE report_id=?")
            .bind(report_id)
            .fetch_one(&database.pool)
            .await
            .unwrap();
    assert_eq!(
        stored, 1,
        "request cancellation removed accepted queue work"
    );
    assert_eq!(writer.stats().abandoned_acknowledgements, 1);
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn router_overload_is_fast_bounded_and_closed_writer_is_retryable() {
    let database = TestDatabase::new().await;
    let (host_id, token) = database.add_host("overloaded-host").await;
    let blocker = begin_write_lock(&database.pool).await;
    let (writer, task) =
        TelemetryWriter::start(database.pool.clone(), config(1, 1, 1, 10, 200, 2_000));
    let app = application(database.pool.clone(), writer.clone());
    let readiness = app
        .clone()
        .oneshot(Request::get("/health/ready").body(Body::empty()).unwrap())
        .await
        .unwrap();
    assert_eq!(readiness.status(), StatusCode::OK);

    let first = report(host_id, Uuid::new_v4(), Utc::now());
    let second = report(host_id, Uuid::new_v4(), Utc::now());
    let third = report(host_id, Uuid::new_v4(), Utc::now());
    let first_task = {
        let app = app.clone();
        let token = token.clone();
        tokio::spawn(async move { app.oneshot(report_request(&token, &first)).await.unwrap() })
    };
    wait_until(|| writer.stats().enqueued >= 1).await;
    tokio::time::sleep(Duration::from_millis(25)).await;
    let second_task = {
        let app = app.clone();
        let token = token.clone();
        tokio::spawn(async move { app.oneshot(report_request(&token, &second)).await.unwrap() })
    };
    wait_until(|| writer.stats().enqueued >= 2).await;

    let overload_started = Instant::now();
    let overloaded = app
        .clone()
        .oneshot(report_request(&token, &third))
        .await
        .unwrap();
    assert_eq!(overloaded.status(), StatusCode::TOO_MANY_REQUESTS);
    assert_eq!(overloaded.headers()[header::RETRY_AFTER], "1");
    assert!(overload_started.elapsed() < Duration::from_millis(150));

    let first_response = first_task.await.unwrap();
    let second_response = second_task.await.unwrap();
    for response in [first_response, second_response] {
        assert_eq!(response.status(), StatusCode::SERVICE_UNAVAILABLE);
        assert_eq!(response.headers()[header::RETRY_AFTER], "1");
    }
    release_write_lock(blocker).await;
    task.shutdown().await.unwrap();
    let stored: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM agent_metric_reports")
        .fetch_one(&database.pool)
        .await
        .unwrap();
    assert_eq!(stored, 2, "timed-out queued work was not drained");

    let readiness = app
        .clone()
        .oneshot(Request::get("/health/ready").body(Body::empty()).unwrap())
        .await
        .unwrap();
    assert_eq!(readiness.status(), StatusCode::SERVICE_UNAVAILABLE);

    let after_close = app
        .oneshot(report_request(
            &token,
            &report(host_id, Uuid::new_v4(), Utc::now()),
        ))
        .await
        .unwrap();
    assert_eq!(after_close.status(), StatusCode::SERVICE_UNAVAILABLE);
    assert_eq!(after_close.headers()[header::RETRY_AFTER], "1");
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn writer_failure_is_503_and_restart_preserves_report_idempotency() {
    let database = TestDatabase::new().await;
    let (host_id, token) = database.add_host("restart-host").await;
    let item = report(host_id, Uuid::new_v4(), Utc::now());

    let failed_directory = tempfile::tempdir().unwrap();
    let failed_url = format!(
        "sqlite://{}",
        failed_directory.path().join("closed.sqlite3").display()
    );
    let failed_pool = store::open_or_initialize(&failed_url).await.unwrap();
    failed_pool.close().await;
    let (failed_writer, failed_task) =
        TelemetryWriter::start(failed_pool, config(4, 2, 5, 10, 500, 1_000));
    let failed_app = application(database.pool.clone(), failed_writer);
    let failed = failed_app
        .oneshot(report_request(&token, &item))
        .await
        .unwrap();
    assert_eq!(failed.status(), StatusCode::SERVICE_UNAVAILABLE);
    assert_eq!(failed.headers()[header::RETRY_AFTER], "1");
    failed_task.shutdown().await.unwrap();

    let (first_writer, first_task) =
        TelemetryWriter::start(database.pool.clone(), config(4, 2, 5, 10, 1_000, 1_000));
    let first = first_writer
        .submit(write(item.clone(), &token))
        .await
        .unwrap();
    assert!(first.0);
    first_task.shutdown().await.unwrap();
    database.pool.close().await;

    let reopened = store::open_existing(&database.database_url).await.unwrap();
    let (second_writer, second_task) =
        TelemetryWriter::start(reopened.clone(), config(4, 2, 5, 10, 1_000, 1_000));
    let replay = second_writer.submit(write(item, &token)).await.unwrap();
    assert!(!replay.0);
    assert_eq!(replay.1, first.1);
    second_task.shutdown().await.unwrap();
    reopened.close().await;
}

#[test]
fn domain_errors_remain_distinguishable_without_exposing_credentials() {
    let unauthorized = anyhow::Error::from(ReportStoreError::Unauthorized);
    let conflict = anyhow::Error::from(ReportStoreError::ReportIdConflict);
    assert!(matches!(
        unauthorized.downcast_ref::<ReportStoreError>(),
        Some(ReportStoreError::Unauthorized)
    ));
    assert!(matches!(
        conflict.downcast_ref::<ReportStoreError>(),
        Some(ReportStoreError::ReportIdConflict)
    ));
    assert!(
        !TelemetrySubmitError::WriterUnavailable
            .to_string()
            .contains("token")
    );
}

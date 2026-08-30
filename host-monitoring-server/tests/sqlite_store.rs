use std::path::{Path, PathBuf};

use chrono::{DateTime, Duration, Utc};
use host_monitoring_server::{model, store, token_hash};
use host_protocol::{
    AgentHealth, AgentPairingRequest, AgentReport, Capability, CpuSnapshot, DiskSnapshot,
    HostIdentity, MemorySnapshot, NetworkSnapshot, PairingStatus, SystemSnapshot,
};
use sqlx::{SqlitePool, sqlite::SqliteConnectOptions, sqlite::SqlitePoolOptions};
use uuid::Uuid;

fn database_path() -> PathBuf {
    std::env::temp_dir().join(format!(
        "host-monitoring-sqlite-regression-{}.db",
        Uuid::new_v4()
    ))
}

async fn open_database(path: &Path) -> SqlitePool {
    let options = SqliteConnectOptions::new()
        .filename(path)
        .create_if_missing(true)
        .foreign_keys(true);
    SqlitePoolOptions::new()
        .max_connections(4)
        .connect_with(options)
        .await
        .expect("open temporary SQLite database")
}

fn host(id: Uuid, os: &str) -> HostIdentity {
    HostIdentity {
        id: id.to_string(),
        os: os.into(),
        os_version: Some("test-os-version".into()),
        kernel_version: Some("test-kernel".into()),
        arch: "x86_64".into(),
        agent_version: env!("CARGO_PKG_VERSION").into(),
    }
}

fn report(host_id: Uuid, collected_at: DateTime<Utc>) -> AgentReport {
    AgentReport {
        schema_version: host_protocol::AGENT_REPORT_SCHEMA_VERSION,
        report_id: Uuid::new_v4().to_string(),
        collected_at,
        host: host(host_id, "linux-updated"),
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
            networks: vec![NetworkSnapshot {
                name: "eth0".into(),
                received_bytes_total: 100,
                transmitted_bytes_total: 200,
                received_bytes_per_second: 12.0,
                transmitted_bytes_per_second: 34.0,
                packets_received_total: 10,
                packets_transmitted_total: 20,
                receive_errors_total: 0,
                transmit_errors_total: 0,
            }],
            disks: vec![DiskSnapshot {
                name: "disk0".into(),
                mount_point: "/".into(),
                file_system: "testfs".into(),
                total_bytes: 2_000,
                available_bytes: 1_500,
                read_bytes_total: 300,
                written_bytes_total: 400,
                read_bytes_per_second: 56.0,
                written_bytes_per_second: 78.0,
                is_read_only: false,
            }],
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

#[tokio::test]
async fn migrated_sqlite_supports_pair_activate_report_remark_and_delete() {
    let path = database_path();
    let pool = open_database(&path).await;
    store::migrate(&pool).await.expect("run real migrations");

    let (invite_result, activation_code) = store::create_invite(&pool, "Server One", 15, "admin")
        .await
        .expect("create invite");
    let store::CreateInviteResult::Created(invite) = invite_result else {
        panic!("fresh database unexpectedly rejected an invite");
    };
    let activation_code = activation_code.expect("created invite has an activation code");
    let instance_id = Uuid::parse_str(&invite.instance_id).expect("canonical instance id");

    let agent_token = "agent-token-for-sqlite-regression";
    let polling_secret = "polling-secret-for-sqlite-regression";
    let agent_token_hash = token_hash(agent_token);
    let polling_secret_hash = token_hash(polling_secret);
    let pairing = AgentPairingRequest {
        host: host(Uuid::new_v4(), "linux"),
        token_hash: agent_token_hash.clone(),
        polling_secret_hash: polling_secret_hash.clone(),
    };
    let pairing_result = store::create_pairing(&pool, &pairing)
        .await
        .expect("create pairing request");
    let request_id = match pairing_result {
        store::CreatePairingResult::Ready {
            request_id,
            created: true,
            ..
        } => request_id,
        _ => panic!("fresh pairing request was not created"),
    };
    let pairing_created_at: Option<DateTime<Utc>> =
        sqlx::query_scalar("SELECT created_at FROM agent_pairing_requests WHERE request_id=?")
            .bind(request_id)
            .fetch_one(&pool)
            .await
            .expect("pairing request includes created_at");
    assert!(pairing_created_at.is_some());

    let activated = store::activate(&pool, request_id, &token_hash(&activation_code), "admin")
        .await
        .expect("activate pairing");
    match activated {
        store::ActivateResult::Active(id) => assert_eq!(id, instance_id),
        _ => panic!("valid invite did not activate the pairing"),
    }
    assert_eq!(
        store::pairing_status(&pool, request_id, &polling_secret_hash)
            .await
            .expect("read pairing status"),
        Some((PairingStatus::Active, Some(instance_id.to_string())))
    );
    assert_eq!(
        store::host_for_token(&pool, &agent_token_hash)
            .await
            .expect("resolve credential"),
        Some(instance_id)
    );

    let collected_at = Utc::now() - Duration::seconds(1);
    let report = report(instance_id, collected_at);
    let metrics = model::validate_report(&report).expect("valid report fixture");
    let (accepted, received_at) = store::store_report(&pool, &report, &agent_token_hash, &metrics)
        .await
        .expect("store telemetry report");
    assert!(accepted);

    let (summary, latest) = store::get_host(&pool, instance_id)
        .await
        .expect("read host")
        .expect("activated host exists");
    assert_eq!(summary.name, "Server One");
    assert_eq!(summary.os, "linux-updated");
    assert_eq!(summary.last_seen_at, received_at);
    assert_eq!(summary.latest_collected_at, Some(collected_at));
    assert_eq!(summary.metrics.cpu_usage_percent, Some(42.5));
    assert_eq!(latest, Some(report.clone()));

    let credential_last_used: Option<DateTime<Utc>> =
        sqlx::query_scalar("SELECT last_used_at FROM agent_credentials WHERE token_hash=?")
            .bind(&agent_token_hash)
            .fetch_one(&pool)
            .await
            .expect("read credential timestamp");
    assert_eq!(credential_last_used, Some(received_at));

    let history = store::history(
        &pool,
        instance_id,
        Some(collected_at - Duration::seconds(1)),
        Some(collected_at + Duration::seconds(1)),
        10,
    )
    .await
    .expect("query bounded history")
    .expect("host exists");
    assert_eq!(history.len(), 1);
    assert_eq!(history[0].report_id, report.report_id);

    assert!(
        store::update_remark(&pool, instance_id, "Renamed Server", "admin")
            .await
            .expect("update remark")
    );
    assert_eq!(
        store::get_host(&pool, instance_id)
            .await
            .expect("read renamed host")
            .expect("renamed host exists")
            .0
            .name,
        "Renamed Server"
    );

    assert!(
        store::delete_host(&pool, instance_id, "admin")
            .await
            .expect("delete host")
    );
    let remaining: i64 = sqlx::query_scalar(
        "SELECT \
           (SELECT count(*) FROM monitored_hosts) + \
           (SELECT count(*) FROM agent_metric_reports) + \
           (SELECT count(*) FROM agent_credentials) + \
           (SELECT count(*) FROM agent_pairing_requests) + \
           (SELECT count(*) FROM agent_instance_invites)",
    )
    .fetch_one(&pool)
    .await
    .expect("count deleted host data");
    assert_eq!(remaining, 0);
    let complete_audits: i64 =
        sqlx::query_scalar("SELECT count(*) FROM audit_events WHERE created_at IS NOT NULL")
            .fetch_one(&pool)
            .await
            .expect("count complete audit events");
    assert_eq!(complete_audits, 4);

    pool.close().await;
    let reopened = open_database(&path).await;
    store::migrate(&reopened)
        .await
        .expect("migrations remain idempotent after reopening");
    assert!(
        store::get_host(&reopened, instance_id)
            .await
            .expect("read reopened database")
            .is_none()
    );
    reopened.close().await;
    std::fs::remove_file(path).expect("remove temporary SQLite database");
}

use std::path::{Path, PathBuf};

use chrono::Utc;
use host_monitoring_server::store;
use sqlx::{Sqlite, pool::PoolConnection};
use uuid::Uuid;

fn database_path() -> PathBuf {
    std::env::temp_dir().join(format!(
        "host-monitoring-connection-regression-{}.db",
        Uuid::new_v4()
    ))
}

fn database_url(path: &Path) -> String {
    format!("sqlite://{}", path.to_string_lossy().replace('\\', "/"))
}

async fn assert_connection_baseline(connection: &mut PoolConnection<Sqlite>) {
    let journal_mode: String = sqlx::query_scalar("PRAGMA journal_mode")
        .fetch_one(&mut **connection)
        .await
        .expect("read journal_mode");
    assert_eq!(journal_mode.to_ascii_lowercase(), "wal");

    let foreign_keys: i64 = sqlx::query_scalar("PRAGMA foreign_keys")
        .fetch_one(&mut **connection)
        .await
        .expect("read foreign_keys");
    assert_eq!(foreign_keys, 1);

    let busy_timeout: i64 = sqlx::query_scalar("PRAGMA busy_timeout")
        .fetch_one(&mut **connection)
        .await
        .expect("read busy_timeout");
    assert_eq!(busy_timeout, 5_000);

    let synchronous: i64 = sqlx::query_scalar("PRAGMA synchronous")
        .fetch_one(&mut **connection)
        .await
        .expect("read synchronous");
    assert_eq!(synchronous, 2);
}

async fn assert_database_checks(pool: &sqlx::SqlitePool) {
    let integrity: String = sqlx::query_scalar("PRAGMA integrity_check")
        .fetch_one(pool)
        .await
        .expect("run integrity_check");
    assert_eq!(integrity, "ok");

    let foreign_key_violations = sqlx::query("PRAGMA foreign_key_check")
        .fetch_all(pool)
        .await
        .expect("run foreign_key_check");
    assert!(foreign_key_violations.is_empty());
}

#[tokio::test]
async fn production_connection_config_survives_close_and_reopen() {
    let path = database_path();
    assert!(!path.exists());
    let url = database_url(&path);

    let pool = store::connect(&url)
        .await
        .expect("production connection creates the database");
    assert!(path.is_file());
    store::migrate(&pool).await.expect("migrate database");

    let mut first = pool.acquire().await.expect("acquire first connection");
    let mut second = pool.acquire().await.expect("acquire second connection");
    assert_connection_baseline(&mut first).await;
    assert_connection_baseline(&mut second).await;
    drop(first);
    drop(second);

    let host_id = Uuid::new_v4();
    let now = Utc::now();
    sqlx::query(
        "INSERT INTO monitored_hosts(\
           host_id,name,os,arch,agent_version,registered_at,last_seen_at\
         ) VALUES(?,?,?,?,?,?,?)",
    )
    .bind(host_id)
    .bind("Persistent Host")
    .bind("linux")
    .bind("x86_64")
    .bind(env!("CARGO_PKG_VERSION"))
    .bind(now)
    .bind(now)
    .execute(&pool)
    .await
    .expect("seed persistent host");

    let invalid_credential = sqlx::query(
        "INSERT INTO agent_credentials(credential_id,host_id,token_hash,issued_at) \
         VALUES(?,?,?,?)",
    )
    .bind(Uuid::new_v4())
    .bind(Uuid::new_v4())
    .bind("orphaned-token-hash")
    .bind(now)
    .execute(&pool)
    .await;
    assert!(
        invalid_credential.is_err(),
        "foreign keys were not enforced"
    );
    assert_database_checks(&pool).await;
    pool.close().await;

    let reopened = store::connect(&url).await.expect("reopen database");
    store::migrate(&reopened)
        .await
        .expect("migrations remain idempotent after reopening");
    let mut first = reopened
        .acquire()
        .await
        .expect("acquire reopened connection");
    let mut second = reopened
        .acquire()
        .await
        .expect("acquire second reopened connection");
    assert_connection_baseline(&mut first).await;
    assert_connection_baseline(&mut second).await;
    drop(first);
    drop(second);

    let stored_name: String =
        sqlx::query_scalar("SELECT name FROM monitored_hosts WHERE host_id=?")
            .bind(host_id)
            .fetch_one(&reopened)
            .await
            .expect("read host after reopening");
    assert_eq!(stored_name, "Persistent Host");
    assert_database_checks(&reopened).await;
    reopened.close().await;

    std::fs::remove_file(path).expect("remove temporary SQLite database");
}

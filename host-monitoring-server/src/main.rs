use clap::Parser;
use host_monitoring_server::{
    config::{Cli, Command},
    database_lock::{ApplicationLock, MaintenanceLock},
    http::{AppState, router},
    release_bundle, release_contract,
    retention::RetentionMaintenance,
    store,
};

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "info,tower_http=info".into()),
        )
        .init();
    match Cli::parse().command {
        Command::Serve => {
            anyhow::ensure!(
                !release_contract::BinaryIdentity::current()?.is_release_bound(),
                "source-bound release binaries must use serve-release"
            );
            serve(None).await?;
        }
        Command::ServeRelease(args) => {
            release_bundle::verify_release(&args.root)?;
            serve(Some(&args.root)).await?;
        }
        Command::AdminCreate(database) => {
            let maintenance = MaintenanceLock::exclusive(&database.database_url)?;
            let pool = store::open_or_initialize(&maintenance.database_url()).await?;
            let email = std::env::var("HOST_MONITORING_BOOTSTRAP_ADMIN_EMAIL")
                .unwrap_or_else(|_| "admin@example.com".to_string());
            let password = std::env::var("HOST_MONITORING_BOOTSTRAP_ADMIN_PASSWORD").ok();
            store::ensure_admin_user(&pool, &email, password.as_deref()).await?;
            println!("{{\"status\":\"admin-ready\",\"email\":{email:?}}}");
        }
        Command::AdminResetPassword(args) => {
            let maintenance = MaintenanceLock::exclusive(&args.database_url)?;
            let pool = store::open_existing(&maintenance.database_url()).await?;
            store::reset_admin_password(&pool, &args.email, &args.password).await?;
            println!(
                "{{\"status\":\"password-reset\",\"email\":{:?}}}",
                args.email
            );
        }
        Command::Doctor => {
            let config = host_monitoring_server::config::ValidatedConfig::from_runtime()?;
            let maintenance = MaintenanceLock::shared(&config.database_url)?;
            let pool = store::open_existing(&maintenance.database_url()).await?;
            let database_ready = store::ready(&pool).await;
            let retention_ready = store::retention_ready(&pool).await;
            println!(
                "{{\"status\":\"{}\",\"bind\":\"{}\",\"database_ready\":{database_ready},\"retention_ready\":{retention_ready}}}",
                if database_ready && retention_ready {
                    "ok"
                } else {
                    "degraded"
                },
                config.bind
            );
            if !database_ready || !retention_ready {
                anyhow::bail!("database is not ready");
            }
        }
        Command::Identity => {
            println!(
                "{}",
                host_monitoring_server::release_contract::current_json()?
            );
        }
        Command::VerifyRelease(args) => {
            let report = release_bundle::verify_release(&args.root)?;
            println!("{}", serde_json::to_string(&report)?);
        }
    }
    Ok(())
}

async fn serve(release_root: Option<&std::path::Path>) -> anyhow::Result<()> {
    let config = host_monitoring_server::config::ValidatedConfig::from_runtime()?;
    if let Some(root) = release_root {
        anyhow::ensure!(
            config.static_dir == root.join("web"),
            "HOST_MONITORING_STATIC_DIR must equal the verified release web directory"
        );
    }
    if config.auth.uses_insecure_development_cookie() {
        tracing::warn!(
            "HOST_MONITORING_DEVELOPMENT is enabled; using an insecure loopback-only session cookie"
        );
    }
    let application_lock = ApplicationLock::acquire(&config.database_url)?;
    let pool = store::open_or_initialize(&application_lock.database_url()).await?;
    store::ensure_admin_user(
        &pool,
        &config.bootstrap_admin_email,
        config.bootstrap_admin_password.as_deref(),
    )
    .await?;
    let listener = tokio::net::TcpListener::bind(config.bind).await?;
    let (_, retention_maintenance) = RetentionMaintenance::start(pool.clone(), config.retention);
    let (state, telemetry_writer) =
        AppState::with_telemetry_config(pool, config.auth, config.telemetry);
    tracing::info!(bind=%config.bind, "host-monitoring server ready");
    let server_result = axum::serve(
        listener,
        router(state, config.static_dir)
            .into_make_service_with_connect_info::<std::net::SocketAddr>(),
    )
    .with_graceful_shutdown(shutdown())
    .await;
    let retention_result = retention_maintenance.shutdown().await;
    let drain_result = telemetry_writer.shutdown().await;
    server_result?;
    retention_result?;
    drain_result?;
    Ok(())
}

async fn shutdown() {
    let ctrl_c = async {
        tokio::signal::ctrl_c()
            .await
            .expect("install Ctrl-C handler")
    };
    #[cfg(unix)]
    let terminate = async {
        tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate())
            .expect("install SIGTERM handler")
            .recv()
            .await;
    };
    #[cfg(not(unix))]
    let terminate = std::future::pending::<()>();
    tokio::select! { _ = ctrl_c => {}, _ = terminate => {} }
}

use clap::Parser;
use host_monitoring_server::{
    config::{Cli, Command},
    http::{AppState, router},
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
            let config = host_monitoring_server::config::ValidatedConfig::from_runtime()?;
            let pool = store::connect(&config.database_url).await?;
            store::migrate(&pool).await?;
            store::ensure_admin_user(
                &pool,
                &config.bootstrap_admin_email,
                config.bootstrap_admin_password.as_deref(),
            )
            .await?;
            let listener = tokio::net::TcpListener::bind(config.bind).await?;
            tracing::info!(bind=%config.bind, "host-monitoring server ready");
            axum::serve(listener, router(AppState::new(pool, config.auth)))
                .with_graceful_shutdown(shutdown())
                .await?;
        }
        Command::Migrate(database) => {
            let pool = store::connect(&database.database_url).await?;
            store::migrate(&pool).await?;
        }
        Command::AdminCreate(database) => {
            let pool = store::connect(&database.database_url).await?;
            store::migrate(&pool).await?;
            let email = std::env::var("HOST_MONITORING_BOOTSTRAP_ADMIN_EMAIL")
                .unwrap_or_else(|_| "admin@example.com".to_string());
            let password = std::env::var("HOST_MONITORING_BOOTSTRAP_ADMIN_PASSWORD").ok();
            store::ensure_admin_user(&pool, &email, password.as_deref()).await?;
            println!("{{\"status\":\"admin-ready\",\"email\":{email:?}}}");
        }
        Command::AdminResetPassword(args) => {
            let pool = store::connect(&args.database_url).await?;
            store::reset_admin_password(&pool, &args.email, &args.password).await?;
            println!("{{\"status\":\"password-reset\",\"email\":{:?}}}", args.email);
        }
        Command::BackupCreate(args) => {
            create_pg_dump(&args.database_url, &args.output)?;
            println!("{{\"status\":\"backup-created\",\"output\":{:?}}}", args.output);
        }
        Command::BackupVerify(args) => {
            anyhow::ensure!(
                args.output.is_file(),
                "backup file does not exist: {}",
                args.output.display()
            );
            println!("{{\"status\":\"backup-verified\",\"output\":{:?}}}", args.output);
        }
        Command::Restore(args) => {
            restore_pg_dump(&args.database_url, &args.input)?;
            println!("{{\"status\":\"restored\",\"input\":{:?}}}", args.input);
        }
        Command::Doctor => {
            let config = host_monitoring_server::config::ValidatedConfig::from_runtime()?;
            let pool = store::connect(&config.database_url).await?;
            let database_ready = store::ready(&pool).await;
            println!(
                "{{\"status\":\"{}\",\"bind\":\"{}\",\"database_ready\":{database_ready}}}",
                if database_ready { "ok" } else { "degraded" },
                config.bind
            );
            if !database_ready {
                anyhow::bail!("database is not ready");
            }
        }
    }
    Ok(())
}

fn create_pg_dump(database_url: &str, output: &std::path::Path) -> anyhow::Result<()> {
    let file = std::fs::File::create(output)?;
    let status = std::process::Command::new("pg_dump")
        .arg("--format=custom")
        .arg("--file")
        .arg(output)
        .arg(database_url)
        .status()?;
    anyhow::ensure!(status.success(), "pg_dump failed");
    let _ = file;
    Ok(())
}

fn restore_pg_dump(database_url: &str, input: &std::path::Path) -> anyhow::Result<()> {
    anyhow::ensure!(input.is_file(), "restore file does not exist");
    let status = std::process::Command::new("pg_restore")
        .arg("--clean")
        .arg("--if-exists")
        .arg("--no-owner")
        .arg("--dbname")
        .arg(database_url)
        .arg(input)
        .status()?;
    anyhow::ensure!(status.success(), "pg_restore failed");
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

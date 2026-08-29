use clap::Parser;
use union_host_monitoring_worker::{
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
            let config = union_host_monitoring_worker::config::ValidatedConfig::from_runtime()?;
            let pool = store::connect(&config.database_url).await?;
            store::migrate(&pool).await?;
            let listener = tokio::net::TcpListener::bind(config.bind).await?;
            tracing::info!(bind=%config.bind, "Union private host-monitoring worker ready");
            axum::serve(listener, router(AppState::new(pool, config.gateway)))
                .with_graceful_shutdown(shutdown())
                .await?;
        }
        Command::Migrate(database) => {
            let pool = store::connect(&database.database_url).await?;
            store::migrate(&pool).await?;
        }
    }
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

use std::{
    env,
    net::{IpAddr, SocketAddr},
    str::FromStr,
    time::Duration,
};

use base64::{Engine as _, engine::general_purpose::STANDARD};
use clap::{Parser, Subcommand};

use crate::auth::Auth;

#[derive(Debug, Parser)]
#[command(name = "host-monitoring-server", version, about)]
pub struct Cli {
    #[command(subcommand)]
    pub command: Command,
}

#[derive(Debug, Subcommand)]
pub enum Command {
    /// Apply this project's PostgreSQL migrations, then serve its HTTP API.
    Serve,
    /// Apply only this project's PostgreSQL migrations.
    Migrate(Database),
    /// Run a deployment health check against the configured instance.
    Doctor,
    /// Create the initial local administrator in the configured database.
    AdminCreate(Database),
    /// Reset an existing local administrator password.
    AdminResetPassword(AdminResetPassword),
    /// Create a PostgreSQL dump backup.
    BackupCreate(Backup),
    /// Verify a PostgreSQL dump backup file.
    BackupVerify(Backup),
    /// Restore a PostgreSQL dump backup.
    Restore(Restore),
}

#[derive(Debug, Clone, clap::Args)]
pub struct Database {
    #[arg(long)]
    pub database_url: String,
}

#[derive(Debug, Clone, clap::Args)]
pub struct AdminResetPassword {
    #[arg(long)]
    pub database_url: String,
    #[arg(long)]
    pub email: String,
    #[arg(long, hide_env_values = true)]
    pub password: String,
}

#[derive(Debug, Clone, clap::Args)]
pub struct Backup {
    #[arg(long)]
    pub database_url: String,
    #[arg(long)]
    pub output: std::path::PathBuf,
}

#[derive(Debug, Clone, clap::Args)]
pub struct Restore {
    #[arg(long)]
    pub database_url: String,
    #[arg(long)]
    pub input: std::path::PathBuf,
}

#[derive(Clone)]
pub struct ValidatedConfig {
    pub bind: SocketAddr,
    pub database_url: String,
    pub auth: Auth,
    pub bootstrap_admin_email: String,
    pub bootstrap_admin_password: Option<String>,
}

impl ValidatedConfig {
    pub fn from_runtime() -> anyhow::Result<Self> {
        let database_url = required("HOST_MONITORING_DATABASE_URL")?;
        if !database_url.starts_with("sqlite:") && !database_url.starts_with("sqlite://") {
            anyhow::bail!("HOST_MONITORING_DATABASE_URL must be a SQLite URL");
        }
        let session_secret = STANDARD
            .decode(required("HOST_MONITORING_SESSION_SECRET")?)
            .map_err(|_| anyhow::anyhow!("HOST_MONITORING_SESSION_SECRET must be base64"))?;
        let session_ttl = Duration::from_secs(parse_u64(
            "HOST_MONITORING_SESSION_TTL_SECONDS",
            43_200,
        )?);
        let cookie_secure = parse_bool("HOST_MONITORING_SESSION_COOKIE_SECURE", false)?;
        Ok(Self {
            bind: value("HOST_MONITORING_BIND", "127.0.0.1:18105")
                .parse()
                .map_err(|_| anyhow::anyhow!("HOST_MONITORING_BIND must be a socket address"))?,
            database_url,
            auth: Auth::new(session_secret, session_ttl, cookie_secure)?,
            bootstrap_admin_email: value(
                "HOST_MONITORING_BOOTSTRAP_ADMIN_EMAIL",
                "admin@example.com",
            ),
            bootstrap_admin_password: env::var("HOST_MONITORING_BOOTSTRAP_ADMIN_PASSWORD").ok(),
        })
    }
}

pub fn forwarded_ip(value: &str) -> Option<IpAddr> {
    IpAddr::from_str(value.split(',').next()?.trim()).ok()
}

fn required(name: &str) -> anyhow::Result<String> {
    env::var(name).map_err(|_| anyhow::anyhow!("{name} is required"))
}

fn value(name: &str, default: &str) -> String {
    env::var(name).unwrap_or_else(|_| default.to_string())
}

fn parse_u64(name: &str, default: u64) -> anyhow::Result<u64> {
    value(name, &default.to_string())
        .parse()
        .map_err(|_| anyhow::anyhow!("{name} must be an unsigned integer"))
}

fn parse_bool(name: &str, default: bool) -> anyhow::Result<bool> {
    value(name, if default { "true" } else { "false" })
        .parse()
        .map_err(|_| anyhow::anyhow!("{name} must be true or false"))
}

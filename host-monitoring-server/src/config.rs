use std::{env, net::SocketAddr, time::Duration};

use clap::{Parser, Subcommand};

use crate::auth::{Auth, CookieMode};

#[derive(Debug, Parser)]
#[command(name = "host-monitoring-server", version, about)]
pub struct Cli {
    #[command(subcommand)]
    pub command: Command,
}

#[derive(Debug, Subcommand)]
pub enum Command {
    /// Apply this product's SQLite migrations, then serve its HTTP API.
    Serve,
    /// Apply only this product's SQLite migrations.
    Migrate(Database),
    /// Run a deployment health check against the configured instance.
    Doctor,
    /// Create the initial local administrator in the configured database.
    AdminCreate(Database),
    /// Reset an existing local administrator password.
    AdminResetPassword(AdminResetPassword),
    /// Create a verified online SQLite backup without overwriting a file.
    BackupCreate(Backup),
    /// Verify SQLite integrity, foreign keys and the product schema.
    BackupVerify(Backup),
    /// Atomically restore a verified SQLite backup while the service is stopped.
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
        let bind: SocketAddr = value("HOST_MONITORING_BIND", "127.0.0.1:18105")
            .parse()
            .map_err(|_| anyhow::anyhow!("HOST_MONITORING_BIND must be a socket address"))?;
        let development = parse_bool("HOST_MONITORING_DEVELOPMENT", false)?;
        let cookie_mode = cookie_mode(bind, development)?;
        let idle_ttl = Duration::from_secs(parse_u64(
            "HOST_MONITORING_SESSION_IDLE_TTL_SECONDS",
            1_800,
        )?);
        let absolute_ttl = Duration::from_secs(parse_u64(
            "HOST_MONITORING_SESSION_ABSOLUTE_TTL_SECONDS",
            43_200,
        )?);
        Ok(Self {
            bind,
            database_url,
            auth: Auth::new(idle_ttl, absolute_ttl, cookie_mode)?,
            bootstrap_admin_email: value(
                "HOST_MONITORING_BOOTSTRAP_ADMIN_EMAIL",
                "admin@example.com",
            ),
            bootstrap_admin_password: env::var("HOST_MONITORING_BOOTSTRAP_ADMIN_PASSWORD").ok(),
        })
    }
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

fn cookie_mode(bind: SocketAddr, development: bool) -> anyhow::Result<CookieMode> {
    if development && !bind.ip().is_loopback() {
        anyhow::bail!("HOST_MONITORING_DEVELOPMENT requires a loopback HOST_MONITORING_BIND");
    }
    Ok(if development {
        CookieMode::LoopbackDevelopment
    } else {
        CookieMode::Production
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn insecure_development_cookie_mode_is_explicit_and_loopback_only() {
        assert_eq!(
            cookie_mode("127.0.0.1:18105".parse().unwrap(), false).unwrap(),
            CookieMode::Production
        );
        assert_eq!(
            cookie_mode("127.0.0.1:18105".parse().unwrap(), true).unwrap(),
            CookieMode::LoopbackDevelopment
        );
        assert!(cookie_mode("0.0.0.0:18105".parse().unwrap(), true).is_err());
    }
}

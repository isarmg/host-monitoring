use std::{
    net::{IpAddr, SocketAddr},
    str::FromStr,
};

use clap::{Parser, Subcommand};
use serde::Deserialize;

#[derive(Debug, Parser)]
#[command(name = "union-host-monitoring-worker", version, about)]
pub struct Cli {
    #[command(subcommand)]
    pub command: Command,
}

#[derive(Debug, Subcommand)]
pub enum Command {
    /// Apply this module's PostgreSQL migrations, then serve its private HTTP API.
    Serve,
    /// Apply only this module's PostgreSQL migrations.
    Migrate(Database),
}

#[derive(Debug, Clone, clap::Args)]
pub struct Database {
    #[arg(long)]
    pub database_url: String,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct RuntimeConfiguration {
    database_url: String,
}

impl ValidatedConfig {
    pub fn from_runtime() -> anyhow::Result<Self> {
        let manifest =
            sarmg_platform_core::PluginManifest::parse_json(include_str!("../manifest.json"))?;
        let context = sarmg_platform_sdk::ProcessContext::from_env(&manifest)?;
        let configuration: RuntimeConfiguration = context.load_configuration()?;
        if !configuration.database_url.starts_with("postgresql://")
            && !configuration.database_url.starts_with("postgres://")
        {
            anyhow::bail!("host-monitoring requires a PostgreSQL database URL");
        }
        Ok(Self {
            bind: context.bind,
            database_url: configuration.database_url,
            gateway: sarmg_platform_gateway::GatewayIdentity::from_env(
                crate::auth::MODULE_AUDIENCE,
                crate::auth::MODULE_PREFIX,
            )?,
        })
    }
}

#[derive(Debug, Clone)]
pub struct ValidatedConfig {
    pub bind: SocketAddr,
    pub database_url: String,
    pub gateway: sarmg_platform_gateway::GatewayIdentity,
}

pub fn forwarded_ip(value: &str) -> Option<IpAddr> {
    IpAddr::from_str(value.split(',').next()?.trim()).ok()
}

#[cfg(test)]
mod tests {
    #[test]
    fn shared_gateway_contract_accepts_only_host_monitoring_identity() {
        let token = "ab".repeat(32);
        let identity = sarmg_platform_gateway::GatewayIdentity::new(
            sarmg_platform_gateway::PROTOCOL,
            crate::auth::MODULE_AUDIENCE,
            token,
            crate::auth::MODULE_PREFIX,
            crate::auth::MODULE_AUDIENCE,
            crate::auth::MODULE_PREFIX,
        );
        assert!(identity.is_ok());
    }
}

pub mod application;
pub mod auth;
pub mod cli;
pub mod config;
pub mod database_lock;
pub mod database_schema;
pub mod domain;
pub mod error;
pub mod http;
pub mod infrastructure;
mod login;
pub mod model;
pub mod operations;
mod pairing_admission;
pub mod retention;
pub mod store;
pub mod telemetry;

use sha2::{Digest, Sha256};

pub fn token_hash(token: &str) -> String {
    format!("{:x}", Sha256::digest(token.as_bytes()))
}

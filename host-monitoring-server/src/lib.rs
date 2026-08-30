pub mod auth;
pub mod config;
pub mod database_lock;
pub mod database_schema;
pub mod error;
pub mod http;
mod login;
pub mod model;
mod pairing_admission;
pub mod release_contract;
pub mod retention;
pub mod store;
pub mod telemetry;

use sha2::{Digest, Sha256};

pub fn token_hash(token: &str) -> String {
    format!("{:x}", Sha256::digest(token.as_bytes()))
}

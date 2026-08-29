pub mod auth;
pub mod application;
pub mod cli;
pub mod config;
pub mod domain;
pub mod error;
pub mod http;
pub mod infrastructure;
pub mod model;
pub mod operations;
pub mod store;

use sha2::{Digest, Sha256};

pub fn token_hash(token: &str) -> String {
    format!("{:x}", Sha256::digest(token.as_bytes()))
}

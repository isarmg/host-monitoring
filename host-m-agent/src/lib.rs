//! UnionC 的跨平台只读遥测 Agent。
//!
//! Agent 不监听端口、不执行服务端命令，也不包含自更新器。所有平台差异都通过
//! capability 明确表达；缺失数据使用 `None`，不会用 0 冒充。

#[cfg(feature = "desktop")]
mod atomic_file;
#[cfg(feature = "desktop")]
pub mod collectors;
#[cfg(feature = "desktop")]
pub mod config;
pub mod mobile;
pub mod model;
#[cfg(feature = "otlp")]
pub mod otlp;
#[cfg(feature = "desktop")]
pub mod pairing;
#[cfg(feature = "desktop")]
mod private_fs;
mod report_contract;
#[cfg(feature = "desktop")]
pub mod service;
#[cfg(feature = "desktop")]
pub mod spool;
#[cfg(feature = "desktop")]
mod state_lock;
#[cfg(feature = "desktop")]
pub mod transport;
#[cfg(feature = "desktop")]
pub mod tray_support;

#[cfg(feature = "desktop")]
pub use collectors::SystemSampler;
#[cfg(feature = "desktop")]
pub use config::{AgentCommand, AgentConfig, OutputMode};
pub use model::*;

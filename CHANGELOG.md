# Changelog

## 0.6.0 - Unreleased

- 主机侧组件统一采用 `host-m-agent` 作为源码目录、Cargo package/crate、CLI、桌面服务、
  安装包、移动 SDK、环境变量和管理界面产品名；设备协议切换为唯一的
  `/host-m-agent/v1` 路径，删除旧 `/agent/v1`、`/agent/v2` 入口。
- 移除 Union 模块契约，改为独立 `HOST_MONITORING_*` 环境变量和本地管理员会话；
  0.6 使用独立数据库和本地状态，并重新配对 Agent。
- 将 `host-m-agent` 的完整源码、配置、测试及 Linux、Windows、macOS 打包资产集中到
  Host Monitoring 仓库，使其成为服务器、协议和 Agent 的唯一源码仓库。
- Agent 与 Worker 改为通过 workspace path 使用同一 `host-protocol`，消除仓库内部 Git
  自依赖和跨仓协议版本漂移。
- 将 Agent 三平台编译测试、可选 feature 矩阵、Linux/macOS 生命周期、Windows PE/WiX/MSI
  以及真实 Collector OTLP 端到端验证迁入本仓库 CI。
- 增加 Android、iOS 和 iPadOS 的宿主驱动 Agent 库边界：无默认 feature 构建不包含桌面
  daemon、文件凭据库或内置网络客户端，只负责对宿主提供的沙箱可见数据构建、收敛并编码
  共享报告契约。
- CI 新增固定的 `aarch64-linux-android`、`aarch64-apple-ios` 和
  `aarch64-apple-ios-sim` 库编译矩阵；iOS 与 iPadOS 共用 Apple target。
- Host Worker 保持独立 PostgreSQL 数据边界、loopback-only 本地服务和本地管理端入口。
- Agent 客户端资产由 Host Monitoring 自身发布：桌面端交付 Linux/Windows/macOS 安装资产，
  Android/iOS/iPadOS 交付宿主集成用 Rust SDK 源码包。

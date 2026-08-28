# Changelog

## 0.5.0 - Unreleased

- 将 `unionc-agent` 的完整源码、配置、测试及 Linux、Windows、macOS 打包资产从 Union Core
  仓库迁入 Host Monitoring，使本仓库成为 Host Worker、协议和 Agent 的唯一源码仓库。
- Agent 与 Worker 改为通过 workspace path 使用同一 `unionc-protocol`，消除仓库内部 Git
  自依赖和跨仓协议版本漂移。
- 将 Agent 三平台编译测试、可选 feature 矩阵、Linux/macOS 生命周期、Windows PE/WiX/MSI
  以及真实 Collector OTLP 端到端验证迁入本仓库 CI。
- 增加 Android、iOS 和 iPadOS 的宿主驱动 Agent 库边界：无默认 feature 构建不包含桌面
  daemon、文件凭据库或内置网络客户端，只负责对宿主提供的沙箱可见数据构建、收敛并编码
  共享报告契约。
- CI 新增固定的 `aarch64-linux-android`、`aarch64-apple-ios` 和
  `aarch64-apple-ios-sim` 库编译矩阵；iOS 与 iPadOS 共用 Apple target。
- Host Worker 保持独立 PostgreSQL 数据边界、loopback-only 私有进程和 Union-only 网关入口。
- 明确本仓库不形成绕过 Union 的独立公网服务或第二套平台版本线。

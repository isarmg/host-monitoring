# Union Agent

`unionc-agent` 是 Union Host Monitoring 的跨平台主机侧组件。它只读采集主机遥测，在本机
持久化有限重试队列，并通过 Union Core 的 HTTPS 网关完成配对、激活和报告。Agent 不监听
公网服务端口，也不直接连接 Host Worker 的私有 loopback 地址或数据库。

Agent 与 `host-monitoring-worker` 共用同仓的 `unionc-protocol`，三者按同一版本发布源码。
示例配置见 [`config.example.json`](config.example.json)。生产配置必须使用 HTTPS；只有明确的
本地开发场景才能设置 `allow_insecure_http`。

主要能力包括：

- Linux、Windows、macOS 的 CPU、内存、磁盘、网络及平台特定传感器采集；
- 原生 NVIDIA 采集默认 feature，以及可独立选择的 OTLP 导出 feature；
- 一次性配对、凭据原子落盘、单实例状态锁和有界磁盘 spool；
- Linux systemd/deb/rpm、Windows Service/Tray/WiX MSI、macOS LaunchDaemon/pkg 的打包源码；
- 安装、卸载、失败回滚和显式 purge 的平台生命周期测试。

开发验证从仓库根执行：

```console
cargo test --locked -p unionc-agent
cargo clippy --locked -p unionc-agent --all-targets -- -D warnings
cargo check --locked -p unionc-agent --no-default-features --features otlp --all-targets
```

平台打包细节分别见
[`packaging/linux/PORTABLE-README.md`](packaging/linux/PORTABLE-README.md)、
[`packaging/windows/README.md`](packaging/windows/README.md) 和
[`packaging/macos/README.md`](packaging/macos/README.md)。CI 负责验证打包契约；本仓库不把
Agent 建立为可脱离 Union 兼容矩阵独立演进的产品线。

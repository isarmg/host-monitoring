# host-m-agent

`host-m-agent` 是 Union Host Monitoring 的跨平台主机侧组件。Linux、Windows 和 macOS 使用
完整的桌面 daemon/CLI：它只读采集主机遥测，在本机持久化有限重试队列，并通过
Union Core 的 HTTPS 网关完成配对、激活和报告。Android、iOS 和 iPadOS 则嵌入无默认
feature 的 Rust 库，由原生宿主 App 驱动。两种形态都不监听公网端口，也不直接连接
Host Worker 的私有 loopback 地址或数据库。

Agent 与 `host-monitoring-server` 共用同仓的 `host-protocol`，三者按同一版本发布源码。
示例配置见 [`config.example.json`](config.example.json)。生产配置必须使用 HTTPS；只有明确的
本地开发场景才能设置 `allow_insecure_http`。

0.6 是不兼容断点：配置和配对状态带有精确应用版本，旧文件会被拒绝；安装前必须卸载旧包、
显式 purge 旧状态并重新配对。Agent 不读取旧路径、不转换旧凭据，也不回退到旧网关路由。

主要能力包括：

- Linux、Windows、macOS 的 CPU、内存、磁盘、网络及平台特定传感器采集；
- Android、iOS/iPadOS 的宿主驱动报告构建 API，只接受宿主在当前沙箱与权限内可见的数据；
- 原生 NVIDIA 采集默认 feature，以及可独立选择的 OTLP 导出 feature；
- 一次性配对、凭据原子落盘、单实例状态锁和有界磁盘 spool；
- Linux systemd/deb/rpm、Windows Service/Tray/WiX MSI、macOS LaunchDaemon/pkg 的打包源码；
- 安装、卸载、失败回滚和显式 purge 的平台生命周期测试。

开发验证从仓库根执行：

```console
cargo test --locked -p host-m-agent
cargo clippy --locked -p host-m-agent --all-targets -- -D warnings
cargo check --locked -p host-m-agent --no-default-features --features otlp --all-targets
cargo check --locked -p host-m-agent --target aarch64-linux-android --lib --no-default-features
cargo check --locked -p host-m-agent --target aarch64-apple-ios --lib --no-default-features
cargo check --locked -p host-m-agent --target aarch64-apple-ios-sim --lib --no-default-features
```

## 移动宿主边界

`mobile` 模块是数据契约适配器，不是移动 daemon：

- 宿主 App 通过 `MobileHostAdapter` 传入产品身份与沙箱可见的 `SystemSnapshot`；库只做契约
  约束、上限收敛和 JSON 编码。
- 宿主必须使用 Android Keystore 或 Apple Keychain 保存 Agent 凭据，在原生 HTTPS 客户端发送
  `MobileReportPayload` 时才附加授权；Rust 移动库不读写凭据文件，负载中也不包含 token。
- 调度、后台时间、网络重试和本地队列由宿主 App 及操作系统策略决定。iOS/iPadOS 和 Android
  可以暂停或终止后台工作，因此不承诺固定采样周期、常驻运行或整机可见性。
- Rust 的 `aarch64-apple-ios` 和 `aarch64-apple-ios-sim` 同时服务 iOS 与 iPadOS；宿主用
  `MobilePlatform::Ios` 或 `MobilePlatform::IpadOs` 保留产品身份。
- CI 只证明 Rust 库的目标编译契约。本仓库没有 Android/iOS 应用外壳、签名、权限申请或上架流程，
  不会产生或声称产生 APK/IPA。

平台打包细节分别见
[`packaging/linux/PORTABLE-README.md`](packaging/linux/PORTABLE-README.md)、
[`packaging/windows/README.md`](packaging/windows/README.md) 和
[`packaging/macos/README.md`](packaging/macos/README.md)。CI 负责验证打包契约；本仓库不把
Agent 建立为可脱离 Union 兼容矩阵独立演进的产品线。

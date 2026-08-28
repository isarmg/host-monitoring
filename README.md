# Union Host Monitoring

Union Host Monitoring 是 Union 主机监控领域的唯一源码仓库。它把主机侧 Agent、平台私有
Host Worker 和双方共用的线协议放在同一个 Rust workspace 中统一版本化，避免 Agent 与
Worker 分属不同仓库后出现协议漂移。

本仓库不是可绕过 Union 独立暴露的服务。Union Core 仍是唯一公网入口；Union Builder 在
发行构建阶段固定本仓库的不可变 commit，并把 Host Worker 纳入所选发行。远端 Agent 只向
Union 网关发起出站连接，不能直接访问 Worker 的 loopback 端口。

## 仓库结构

| 路径 | 作用 |
|---|---|
| `agent/` | `unionc-agent`：Linux、Windows、macOS 桌面 daemon，以及 Android、iOS/iPadOS 宿主驱动的只读遥测库 |
| `host-monitoring-worker/` | `union-host-monitoring-worker`：私有 Backend、动态 Frontend、Manifest、权限、配置 Schema、PostgreSQL migration 和版本元数据 |
| `protocol/` | `unionc-protocol`：Agent 与 Worker 共用的稳定 JSON DTO 和线级约束 |

三个 crate 统一采用版本 `0.5.0`、Rust `1.98`、Apache-2.0 和单一作者
`sarmg <isarmg@163.com>`。`unionc-agent` 与 Worker 均通过 workspace path 依赖
`unionc-protocol`；仓库内部禁止通过 Git URL、分支或 tag 反向依赖自身。

## 运行与安全边界

- Union Core 负责公网 TLS、身份认证、RBAC、网关路由、进程监管、健康检查、审计和模块
  生命周期；Host Worker 只能监听 loopback。
- Host Worker 使用模块专属 PostgreSQL database/schema 和 migration，不访问 Core 或其他
  模块的数据。
- Agent 在被监控主机上独立运行，通过 Union 公网网关完成配对和报告；Agent 永远不会获得
  Core 注入给 Worker 的私有进程凭据。
- Agent 默认拒绝明文 HTTP。`allow_insecure_http` 只用于操作者明确选择的本地开发环境，正式
  部署必须使用 HTTPS。
- Android 和 iOS/iPadOS 不运行桌面 daemon。原生宿主 App 决定调度与后台时间、只采集
  沙箱可见信息、用 Android Keystore 或 Apple Keychain 管理凭据，并通过 HTTPS 发送库
  生成的有界 JSON；本仓库不声称提供整机遥测或永久后台运行。
- `unionc-protocol` 只定义序列化 DTO 和线级约束，不包含采集、HTTP、鉴权、数据库或进程
  管理逻辑。
- 动态前端是 Builder 纳入 Union 发行的可信同源代码，不是第三方 JavaScript 沙箱。

Worker 的完整契约见
[`host-monitoring-worker/README.md`](host-monitoring-worker/README.md)，Agent 的配置、功能和
平台打包入口见 [`agent/README.md`](agent/README.md)。

## 验证

本地基础验证：

```console
cargo fmt --all -- --check
cargo check --locked --workspace --all-targets
cargo test --locked --workspace
cargo clippy --locked --workspace --all-targets -- -D warnings
node --test host-monitoring-worker/frontend/entry.test.mjs
```

Agent 的可选能力和 Linux 打包契约：

```console
cargo check --locked -p unionc-agent --no-default-features --lib
cargo check --locked -p unionc-agent --no-default-features --features otlp --all-targets
cargo check --locked -p unionc-agent --no-default-features --features nvidia --all-targets
sh agent/packaging/linux/tests/test-lifecycle.sh
sh agent/packaging/linux/tests/test-build-packages.sh
```

CI 在 Linux、Windows 和 macOS 上分别编译并测试桌面 Agent，并对
`aarch64-linux-android`、`aarch64-apple-ios` 和 `aarch64-apple-ios-sim` 执行无默认 feature 的
移动库编译检查。iOS 与 iPadOS 共用 Apple device/simulator Rust target，产品身份由宿主
显式传入。CI 同时验证 Linux 生命周期与包构建器、Windows PE/WiX/MSI、macOS 安装
生命周期，并使用固定摘要的真实 OpenTelemetry Collector 覆盖 OTLP 端到端路径。
GitHub Actions、runner 主版本、Rust 工具链和容器镜像均固定。

## 发布边界

本仓库 CI 验证源码和原生打包契约，但不会把 Worker 作为独立公网产品发布。Worker 的选择
与交付由 Union Builder 的完整发行图负责。Agent 是远端配套程序，其安装介质如何随 Union
发行交付属于上层发行策略；这里不建立第二套可独立演进的平台版本线。

## 许可证与安全

本仓库由单一作者 `sarmg <isarmg@163.com>` 以 Apache License 2.0 发布。许可证正文见
[`LICENSE-APACHE`](LICENSE-APACHE)，安全问题请按 [`SECURITY.md`](SECURITY.md) 私下报告。

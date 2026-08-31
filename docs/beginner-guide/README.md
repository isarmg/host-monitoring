# Host Monitoring 初学者学习指南

本手册采用十章渐进结构。它不是命令抄写表，而是把“为什么这样设计、失败时系统处于什么状态、修改
时必须联动哪些边界”讲清楚。初次接触项目建议依序阅读，值班或评审可直接进入对应章节。

1. [项目全景与版本边界](01-project-overview.md)
2. [开发环境与第一次运行](02-environment-and-first-run.md)
3. [Rust、遥测与协议基础](03-rust-telemetry-and-protocol-basics.md)
4. [服务端请求、登录与配对链路](04-server-request-login-and-pairing.md)
5. [采集、Spool 与投递可靠性](05-collection-spool-and-delivery.md)
6. [Linux、Windows、macOS 与移动宿主](06-platforms-and-packaging.md)
7. [当前报告协议、写入与保留](07-current-report-contract.md)
8. [测试、调试与安全变更方法](08-testing-debugging-and-change-workflow.md)
9. [部署、安全与生产运维](09-deployment-security-and-operations.md)
10. [源码阅读路线、练习与术语](10-reading-roadmap-and-glossary.md)

下文保留单页速览，详细不变量、练习和故障语义以上述章节为准。

## 1. 产品解决什么问题

Host Monitoring 用一个本地控制面集中查看多台主机的 CPU、内存、磁盘、网络和平台传感器。每台主机
运行 `host-monitor`，Agent 只发起出站连接，不监听公网端口；服务端负责配对授权、报告验证、历史
存储、聚合、用户会话和 Web 展示。

“只读采集”表示 Agent 不以监控为理由修改系统配置。安装器仍需要平台权限创建服务账户、安装服务和
保护本地状态，因此运行时最小权限与安装时权限要分开理解。

## 2. 三个核心 crate

```text
host-protocol
  ├─ pairing.rs：配对消息
  ├─ report.rs：遥测报告
  └─ json_u64.rs：跨语言安全整数表示

host-monitor
  ├─ collectors/：平台采集器
  ├─ pairing/：一次性配对与原子凭据提交
  ├─ delivery/：批次投递、重试和 spool
  ├─ mobile.rs：Android/iOS/iPadOS 宿主适配
  └─ packaging/：三桌面平台安装生命周期

host-monitoring-server
  ├─ auth/login/pairing：管理员和设备身份
  ├─ telemetry/store：有界队列和 SQLite 写入器
  ├─ retention：小时聚合与保留
  └─ web/：独立 React/Vite 管理页面
```

协议 crate 是唯一 wire contract，Server 和 Agent 都通过 workspace path 使用它，不能复制一份 DTO
到另一仓库或用网络 Git 依赖形成自依赖。

## 3. 开发环境

仓库固定 Rust `1.98.0`。服务端 Web 还需要其 lockfile 对应的 Node/npm。先运行：

```bash
rustup toolchain install 1.98.0
cargo +1.98.0 check --workspace --locked --all-targets --all-features
cargo +1.98.0 test --workspace --locked
cd clients/web && npm ci && npm run build
```

跨平台安装包需要额外工具：Linux nFPM 与 systemd 测试环境，Windows WiX 4/PowerShell，macOS
`pkgbuild`、`productbuild` 与 `launchctl` 相关工具。普通业务修改不需要在单机上模拟全部平台，CI
矩阵会在真实目标系统验证。

## 4. 启动开发服务端

最小环境：

```text
HOST_MONITORING_DATABASE_URL=sqlite:///tmp/host-monitoring/app.db
HOST_MONITORING_STATIC_DIR=/绝对路径/clients/web/dist
HOST_MONITORING_BOOTSTRAP_ADMIN_EMAIL=admin@example.com
HOST_MONITORING_BOOTSTRAP_ADMIN_PASSWORD=<开发密码>
HOST_MONITORING_DEVELOPMENT=true
```

```bash
cargo run -p host-monitoring-server -- serve
```

开发模式仍应绑定回环。正式 source-bound 二进制拒绝 `serve`，只接受固定发行树的 `serve-release`。

## 5. 运行 Agent 的学习顺序

从 `config/host-monitor.json.example` 复制到受保护路径，修改服务端 HTTPS 地址和 state directory。
常用命令：

```bash
host-monitor probe --config /etc/host-monitor/config.json
host-monitor pair --config /etc/host-monitor/config.json
host-monitor status --config /etc/host-monitor/config.json
host-monitor once --config /etc/host-monitor/config.json
host-monitor doctor --config /etc/host-monitor/config.json
host-monitor run --config /etc/host-monitor/config.json
```

- `probe` 只验证本地采集。
- `pair` 创建或恢复配对请求，等待浏览器管理员批准。
- `once` 采集并投递一次。
- `doctor` 默认只读检查；显式 delivery 模式才进行端到端发送。
- `run` 是长期服务模式。
- `status` 即使配置损坏也尽量输出机器可读诊断。

## 6. 配对为什么分阶段

Agent 先生成请求并保存 pending 状态；管理员在 Web 控制台授权；Agent 轮询到激活结果后，先将新凭据
原子写入当前状态，再切换 active binding。网络中断时可以恢复同一请求，不会静默生成另一套身份。
明确替换未完成请求必须由用户确认。

设备凭据、TLS 私钥、OTLP Token 和 spool 都是主机敏感数据，不能提交、打印或放在宽权限目录。

## 7. 报告如何可靠送达

采集器生成 `AgentReport` 后进入有界磁盘 spool。投递器对可重试网络/服务错误保留批次，对协议错误或
明确永久拒绝避免无限重试。服务端验证身份、报告 ID 和字段边界后，将报告放入有界内存队列；单一
SQLite writer 批量事务写入，每个报告使用 savepoint 隔离。只有事务提交成功才返回 `202 Accepted`。

## 8. 移动宿主边界

移动端没有 daemon 外壳。无默认 feature 的 Rust 库只接收宿主提供的 `SystemSnapshot`，执行边界收敛
和 JSON 编码；Android/iOS/iPadOS 宿主自己负责权限、后台时间、HTTPS、队列，以及 Keystore/Keychain
中的凭据。仓库只证明 Rust target 可编译，不生成 APK/IPA，也不承诺移动系统中的固定采样周期。

## 9. 修改代码的检查表

- 报告字段：先改 `host-protocol`，再改两端和契约测试。
- Agent 状态：保持排他创建、原子替换、权限与单实例锁。
- 服务端写入：不能绕过有界队列让每个请求直接争用 SQLite。
- 保留策略：必须保持“先幂等聚合、后有界删除、永不删除 latest”。
- 平台安装：修改脚本时同时运行安装、卸载、回滚、purge 和 PE/WiX/LaunchDaemon 静态测试。
- 版本变更：产品只接受新当前身份，不添加旧字段、旧路径或旧状态 fallback。

## 10. 术语

- **OTLP**：OpenTelemetry Protocol，可选的遥测额外导出目标。
- **spool**：Agent 本地有界持久重试队列。
- **pairing**：管理员显式批准设备并发放当前凭据的流程。
- **savepoint**：SQLite 事务内部隔离单条报告失败的检查点。
- **WHEP/FFI** 不属于本项目；移动侧只使用 Rust library contract。
- **fail closed**：不能证明当前身份、安全路径或数据完整时拒绝运行。

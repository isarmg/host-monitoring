# Host Monitoring 运维文档

## 1. 服务端部署布局

Server 的唯一正式平台/target 是 x86_64 glibc Linux / `x86_64-unknown-linux-gnu`。ARM Linux、musl、
Windows 和 macOS 只可能属于 Agent 交付，不得部署 `host-monitoring-server`。

```text
/opt/isarmg/host-monitoring/releases/0.7.0/   root 持有、只读发行树
/etc/isarmg/host-monitoring.env              0600 生产配置
/var/lib/isarmg/host-monitoring/db/host-monitoring.sqlite3    SQLite 当前数据库
/run/isarmg/host-monitoring/                 systemd runtime
```

systemd 以 `isarmg-host` 运行：

```text
ExecStart=/opt/isarmg/host-monitoring/releases/0.7.0/bin/host-monitoring-server \
  serve-release --root /opt/isarmg/host-monitoring/releases/0.7.0
```

不创建 `current` 或 `latest`。发行树不能由服务账户、group 或 world 写入，也不能包含 symlink、特殊
文件或硬链接别名。

## 2. 构建 Server 发行物

在 x86_64 glibc Linux 上，从干净、annotated `v0.7.0` 精确指向 HEAD 的 checkout，向仓库外已存在目录
构建：

```bash
python3 scripts/package-server-release.py /absolute/output-directory
```

脚本先拒绝其他 OS、架构或 libc，再以显式 `--target x86_64-unknown-linux-gnu` 构建 Web 和 Rust、写严格
manifest、生成 deterministic archive/checksum，随后解包、重定位、真实启动、读取 hashed asset，并执行
篡改拒绝。已有归档或 checksum 不会被覆盖。`build.rs` 还会拒绝非目标编译，二进制在读取配置、打开
SQLite 或监听端口前通过 `uname` 再确认 Linux/x86_64；三层检查均为 fail-closed。

构建依赖 Foundation `0.3.0`：Rust 使用 `sarmg-admin-auth`、`sarmg-contracts`、`sarmg-error`、
`sarmg-sqlite`、`sarmg-schema-identity` 与 `sarmg-server-target`，Web 使用 `@sarmg/admin-web`、
`@sarmg/contracts`、`@sarmg/design-tokens` 与 `@sarmg/http-client`。
`@sarmg/admin-web` 同时锁定 React/Vite/TypeScript 精确版本和共享配置。Rust 六个 crate 均从
`https://github.com/isarmg/sarmg-foundation.git` 取得，并同时固定版本 `=0.3.0` 与完整 revision
`1fe326081cfd896f05ff502e80f99504797c14c6`；不得改回同级目录 `path`。四个 Web 包分别固定到
Foundation GitHub Release `v0.3.0` 下的 `sarmg-admin-web-0.3.0.tgz`、`sarmg-contracts-0.3.0.tgz`、
`sarmg-design-tokens-0.3.0.tgz` 与 `sarmg-http-client-0.3.0.tgz`。`package-lock.json` 还必须记录相同 URL
和每个归档的 `sha512` integrity。这样独立 checkout/CI 只依赖声明的不可变上游，不读取共同父目录。
Foundation 变更必须显式发布新版本并替换当前合同，同时通过 Host 的 Rust 全矩阵、Web clean build、
SQLite reopen 与 Router→Agent 合同测试；不保留旧版本 fallback。

当前 React 工件是最小状态页：管理员登录、Session 恢复、登出和 Host 列表 JSON。它不提供邀请/激活、
详情/历史、备注、删除或 audit 查询界面。上述受保护 API 即使存在，也不能据此宣称已有完整 Web 运维台。

## 3. Server 配置

所有变量使用 `HOST_MONITORING_` 前缀。核心项：

| 变量 | 默认/要求 | 说明 |
|---|---|---|
| `DATABASE_URL` | 必填 SQLite URL | 生产例 `sqlite:///var/lib/isarmg/host-monitoring/db/host-monitoring.sqlite3` |
| `BIND` | `127.0.0.1:18105` | 非开发模式必须保持安全部署边界 |
| `STATIC_DIR` | 必填 | 正式环境必须精确等于发行树 `web/` |
| `DEVELOPMENT` | `false` | 仅本机开发可开启 |
| `BOOTSTRAP_ADMIN_USERNAME` | `admin` | 仅在空 `auth_users` 创建首个管理员；按 Foundation 规则规范化，不是 email，也没有旧变量别名 |
| `BOOTSTRAP_ADMIN_PASSWORD` | 空 `auth_users` 时必填 | 12..1024 字节且无 ASCII control；创建后保存 Foundation 当前 Argon2id hash，不保存明文 |
| `SESSION_IDLE_TTL_SECONDS` | 1800 | 会话空闲期限；必须大于 0，且不得大于 absolute TTL |
| `SESSION_ABSOLUTE_TTL_SECONDS` | 43200 | 会话绝对期限；必须大于 0，任何 idle 刷新都不能越过它 |
| `TELEMETRY_QUEUE_CAPACITY` | 256，最大 1024 | 内存报告队列 |
| `TELEMETRY_BATCH_SIZE` | 64，范围 1..min(512, queue) | 单事务候选报告数 |
| `TELEMETRY_FLUSH_MILLISECONDS` | 25，范围 1..1000 | 低流量 batch 最长聚合等待 |
| `TELEMETRY_ENQUEUE_WAIT_MILLISECONDS` | 10，范围 1..250 | HTTP 请求等待进入 writer queue 的预算 |
| `TELEMETRY_REQUEST_TIMEOUT_MILLISECONDS` | 10000，范围 100..30000 | 从提交到 writer 回应的总预算；必须大于 enqueue + flush |
| `TELEMETRY_SHUTDOWN_DRAIN_MILLISECONDS` | 15000，范围 100..60000 | Server 关机时 writer drain 期限 |
| `RAW_RETENTION_DAYS` | 7，范围 1..365 | 原始报告保留；latest 指向的 raw 行不被清理 |
| `AGGREGATE_RETENTION_DAYS` | 365，最大 3650 | 小时聚合保留，必须严格大于 raw |
| `RETENTION_INTERVAL_SECONDS` | 300，范围 1..86400 | 维护周期；进程启动后也会先运行一次 |
| `RETENTION_BATCH_SIZE` | 256，范围 1..512 | 单个保留事务的有界行批次 |
| `RETENTION_MAX_TRANSACTIONS_PER_RUN` | 12，范围 3..30 | 每轮聚合/删 raw/删 aggregate 的总事务预算 |
| `RETENTION_MAX_RUN_MILLISECONDS` | 2000，范围 100..10000 | 单轮时间预算，并且必须短于 maintenance interval |
| `RETENTION_YIELD_MILLISECONDS` | 10，范围 1..100 | 相邻维护事务之间主动让出执行权的时间 |

变量名在进程环境中必须带完整 `HOST_MONITORING_` 前缀；表中为去前缀后的可读写法。程序只读取环境，
不会解析 `/etc/isarmg/host-monitoring.env` 文件；该路径是 systemd unit 的部署合同。未知环境变量不会被
Server 拒绝，因此应通过配置管理审查拼写，不能把“进程能启动”当作未知变量已生效。

管理员 username 的精确合同是：登录候选 1..64 字节 printable ASCII；trim ASCII whitespace、ASCII
lowercase 后，canonical 值必须为 3..64 字节，首尾是 `[a-z0-9]`，字符仅 `[a-z0-9._-]`，禁止 `@`，
允许相邻分隔符。数据库只存 canonical `username`。`admin` 是默认值，固定 `admin` 的是 role；系统没有
viewer/operator/RBAC。已有任意管理员行时，bootstrap 不创建或覆盖账户，而是逐行验证 username 与当前
Argon2id hash；坏行会阻止 `serve`/`admin-create`，但 `doctor` 目前只检查 Schema/integrity/FK，不能代替
这项启动验证。

### 3.1 Server HTTP 面与身份矩阵

Server 自身只监听 HTTP socket；正式 HTTPS、证书与外部连接限制由可信 reverse proxy 负责。代理必须保留
浏览器发送的单一 `Host`、`Origin` 与 `Sec-Fetch-Site` 事实，不能注入第二个同名字段，也不能把公网请求
直接转给一个可被旁路访问的监听地址。登录来源限流读取 Axum 的 TCP peer `ConnectInfo`，当前不信任
`Forwarded` 或 `X-Forwarded-For`；如果代理复用一个后端源地址，来源桶看到的是代理地址而非公网客户端。

| 路径与方法 | 当前调用方/身份 | 请求边界 | 成功结果与当前限制 |
|---|---|---|---|
| `GET /health/live` | 公开 | 无业务正文 | `200 {"status":"ok"}`；只证明进程路由可响应 |
| `GET /health/ready` | 公开 | 无业务正文 | `200/503`，精确给出 `status/database/retention_schema/telemetry_writer`；不验证管理员内容、磁盘余量或外部代理 |
| `POST /api/v2/auth/login` | 浏览器公开入口 | 4 KiB；exact `{username,password}`；同源；TCP peer 与规范 username 双重限流 | `200` + exact Session；设置 Cookie；不知道账户时仍做 dummy Argon2；成功响应 `no-store` |
| `GET /api/v2/auth/session` | 管理员 Session Cookie | 不接受业务正文；不要求 CSRF | 轮换一个 CSRF token 并返回 exact Session；成功响应 `no-store` |
| `POST /api/v2/auth/logout` | 管理员 Session + CSRF + 同源 | 无业务正文 | 撤销当前 Session、删除其 CSRF 摘要、清除 Cookie；成功响应 `204 no-store` |
| `GET /api/v2/monitoring/hosts` | 管理员 Session | query 只有 `limit/offset`；服务端钳到 1..1000，默认 200 | 分页 Host summary；当前 React 页只调用这一条业务 API |
| `GET /api/v2/monitoring/hosts/{host_id}` | 管理员 Session | canonical UUID | Host summary 与可空 latest 原始报告；React 尚未调用 |
| `GET /api/v2/monitoring/hosts/{host_id}/history` | 管理员 Session | `from/to/limit`；`from <= to`；limit 1..1000，默认 300 | 仍保留的 raw 标量点；不读取 hourly aggregate |
| `GET/POST /api/v2/monitoring/agent-instances` | 管理员 Session；POST 另需 CSRF/同源 | 管理路由组正文上限 16 KiB；POST exact `display_name?/expires_in_minutes?`，期限 5..1440 分钟 | 列表最多 200 条；新建 `201` 只返回一次 activation code 并设 `no-store`；React 尚未调用 |
| `DELETE /api/v2/monitoring/agent-instances/{request_id}` | 管理员 Session + CSRF + 同源 | canonical UUID，只能取消 pending invite | `204`；不存在为 404，非 pending 为 409 |
| `POST /api/v2/host-monitor/activate-admin` | 管理员 Session + CSRF + 同源 | 16 KiB 管理上限；exact request ID + activation code | 与 capability 激活进入同一事务；React 尚未调用 |
| `PATCH/DELETE /api/v2/monitoring/managed-instances/{host_id}` | 管理员 Session + CSRF + 同源 | canonical UUID；PATCH remark trim 后 1..255 UTF-8 bytes | `204`；PATCH 是 last-write-wins，无 ETag/revision；DELETE 永久级联删除且没有产品内恢复 |
| `POST /api/v2/host-monitor/pairing-requests` | 未配对 Agent | Agent 路由组 512 KiB；strict Host、bearer/polling-secret SHA-256；来源/设备/容量限流 | 创建或幂等恢复 pairing request；返回 activation URL，成功 `no-store` |
| `GET /api/v2/host-monitor/pairing-requests/{request_id}` | 持有 request ID 的调用方 | canonical UUID；来源/请求限流 | 只暴露 OS/arch/version/status/expiry 公共摘要；成功 `no-store` |
| `POST /api/v2/host-monitor/pairing-requests/{request_id}/status` | Agent 的 `Pairing <polling_secret>` | 512 KiB 组上限；secret 32..256 字符且无 whitespace | waiting/active/denied/expired 与可空 instance ID；成功 `no-store` |
| `POST /api/v2/host-monitor/activate` | 持有一次性 activation code 的 capability 调用方 | 512 KiB 组上限；来源/请求限流；不是管理员 Session | 激活同一事务状态机；code 错误/过期/重放分别严格失败；成功 `no-store` |
| `POST /api/v2/host-monitor/report` | `Bearer <agent credential>` | 512 KiB；单份 strict report；每 Host 速率桶 | 持久事务提交后才返回 `202`；同 Host 同 ID 重放 `accepted=false` |

登录与管理写操作的同源裁决会把所有原始 `Origin`、`Host`/HTTP/2 authority、`Sec-Fetch-Site` 值交给
Foundation；重复、冲突或非当前形状 fail closed。生产 Cookie 名是 `__Host-host_session`，带
`Path=/; Secure; HttpOnly; SameSite=Strict` 且没有 Domain；开发模式改用非 Secure 的 `host_session`，但
配置层强制监听 loopback。Session token 和 CSRF token 都是 32-byte 随机值，只以 SHA-256 摘要入库；
Session 同时受 idle/absolute TTL、账户 active 与 `session_version` 约束，每个 Session 只保留最近 8 个
CSRF 摘要。

所有 `/api` 的 4xx/5xx（包括 JSON extractor、body 过大、方法错误与未知 API 路径）都会规范为
Foundation `ErrorEnvelope`；健康端点和静态文件不在这个 envelope 范围。当前仅部分敏感成功响应显式
设置 `Cache-Control: no-store`，不能把它扩大解释为所有管理 GET 都由 Server 响应头禁止缓存。

### 3.2 数据库锁矩阵

数据库文件旁有两把不同的 0600 regular-file `flock`，通过 Linux `openat2` 拒绝 symlink、magic-link、
路径穿越和多硬链接。它们是并发协调，不是数据备份或 transaction journal。

| 操作 | instance lock | maintenance lock | 能否与运行中 Server 并行 |
|---|---|---|---|
| `serve` / `serve-release` | 排他，阻止第二个 Server | 共享，持有到 writer/retention 全部停止 | 不适用；同库只允许一个 Server |
| `doctor` | 不取得 | 共享 | 可以；只读检查，仍可能观察持续变化的业务数据 |
| `admin-create` | 不取得 | 排他 | 不可以；Server 的共享锁会令它立即失败 |
| `admin-reset-password` | 不取得 | 排他 | 不可以；必须先停止 Server |
| `identity` / `verify-release` | 不访问数据库 | 不访问数据库 | 可以，但只证明 binary/release，不证明数据库健康 |

锁身份来自规范化后的实际数据库路径；数据库本体、锁文件及其父目录仍必须满足当前文件安全检查。不要
用复制数据库到另一路径的方式绕开锁：那既不是一致快照，也不在当前支持范围。

## 4. Server 日常命令

```bash
host-monitoring-server identity
host-monitoring-server verify-release --root /opt/isarmg/host-monitoring/releases/0.7.0
host-monitoring-server doctor
host-monitoring-server admin-create --database-url sqlite:///path/app.db
host-monitoring-server admin-reset-password --database-url sqlite:///path/app.db \
  --username admin --password '<new-secret>'
```

`admin-create` 从 `HOST_MONITORING_BOOTSTRAP_ADMIN_USERNAME/PASSWORD` 读取首个账户；若库已有账户，它
只验证现有记录。`admin-reset-password` 接受 `--username/--password`，先规范化 username，再写新的当前
Argon2id hash；Schema trigger 同时提升 `session_version`、撤销该账户全部 Session 并删除其 CSRF 摘要。
两条管理员维护命令要求 maintenance 排他锁，因此应先停止运行实例。

当前 reset CLI 的密码是 argv 参数，不支持 stdin/文件 Secret provider；这是明确的运维限制。不要把真实
密码字面量写进可持久 Shell history、脚本、工单或日志，并限制同机进程列表与维护终端的访问。首次创建
完成后从长期环境文件移除 bootstrap 明文密码。项目没有管理员创建/列表/禁用 Web API；不要把
`auth_users` 表可容纳多行误写成完整账户管理功能。

## 5. Agent 配置与诊断

`config/host-monitor.json.example` 是当前完整字段样例；`application_version` 必须等于 `0.7.0`。默认采集
10 秒、慢速采集 30 秒、请求超时 10 秒、jitter 10%、spool 64 MiB。配对端点只接受 HTTPS 或 loopback
HTTP。报告/OTLP 默认也要求 HTTPS，但代码仍允许管理员在持久配置中显式设置
`allow_insecure_http=true` 后使用远程明文 HTTP；这是高风险可选策略，不等于关闭 TLS 证书校验，生产
基线应保持 `false`。自定义 CA 和客户端身份仍会执行正常证书、主机名与有效期验证。

```bash
host-monitor probe --config /etc/host-monitor/config.json
host-monitor status --config /etc/host-monitor/config.json --output json
host-monitor doctor --config /etc/host-monitor/config.json
host-monitor doctor --config /etc/host-monitor/config.json --delivery
```

本地 doctor 与 delivery doctor 含义不同；后者会真实发送报告，应在变更窗口使用。

## 6. Linux Agent

从工作区根构建并调用打包器：

```bash
cargo build --release -p host-monitor
NFPM_ARCH=amd64 clients/host-monitor/packaging/linux/build-packages.sh
```

包安装 `/usr/bin/host-monitor`、0600 配置、systemd unit 和显式 purge 工具。普通卸载保留身份与 spool；
确认不再需要当前状态后才运行 `host-monitor-purge`。Linux collector 会有界读取 hwmon 与 DRM sysfs，
分别表达 AMD/Intel/NVIDIA capability；字段或驱动不存在时保留缺失/错误分类，不用 0 伪装。NVIDIA
NVML 采集通常需要按包内 `host-monitor-gpu.conf` 明确配置设备访问，不能默认放宽整个服务沙箱。

## 7. Windows Agent

WiX 4 MSI 同时安装 Windows Service、Tray 和维护 helper。Tray 是用户交互外壳，Service 是持续采集
主体；两者通过受保护本机控制通道通信。构建/验收使用：

```powershell
clients\host-monitor\packaging\windows\wix\build-msi.cmd 0.7.0 `
  target\x86_64-pc-windows-msvc\release\host-monitor.exe `
  target\x86_64-pc-windows-msvc\release\host-monitor-maintenance.exe `
  target\x86_64-pc-windows-msvc\release\host-monitor-tray.exe
powershell -File clients\host-monitor\packaging\windows\tests\Test-WixAuthoring.ps1
powershell -File clients\host-monitor\packaging\windows\tests\Test-PeSubsystems.ps1
```

当前 MSI 不声明跨版本 UpgradeCode 家族，也不迁移非当前状态。每个发行版本按全新产品安装；需要数据
转换时，必须先在外部仓库建立、评审并验证明确转换边。安装失败必须由 MSI rollback 清理本次创建的
服务和文件。

## 8. macOS Agent

`build-pkg.sh` 生成含 LaunchDaemon、配置、日志轮转和专用不可登录账户的 pkg。验证：

```bash
clients/host-monitor/packaging/macos/tests/validate-packaging.sh
clients/host-monitor/packaging/macos/tests/smoke-pkg.sh
clients/host-monitor/packaging/macos/tests/account-safety-test.sh
clients/host-monitor/packaging/macos/tests/postinstall-failure-test.sh
clients/host-monitor/packaging/macos/tests/uninstall-proof-test.sh
```

卸载脚本只删除能证明属于当前包的资源；不能用宽泛递归路径替代这些身份检查。

### 8.1 安装包签名边界

“能生成包”与“可作为受信正式制品分发”是两项不同能力。当前仓库的 Linux nFPM 和 Windows WiX 构建
流程没有 GPG/Authenticode 签名步骤；相关测试证明结构、权限、PE subsystem 和生命周期，不证明发布者
身份。macOS `build-pkg.sh` 有两种明确模式：

- 设置完整 `Developer ID Installer: ...` identity 时，脚本要求输入 Mach-O 已由 Developer ID
  Application 签名，再签 pkg 并用 `pkgutil --check-signature` 验证；
- 未设置 installer identity 时只生成明确标记的 unsigned prerelease；
- 无论哪种模式，脚本都不执行 Apple notarization 或 stapling。

因此正式分发若要求平台信任链，发布流水线还必须补齐仓库当前没有的 Linux/Windows 签名，以及 macOS
notarization/stapling，并保存签名者、时间戳、摘要和验证结果；不能把打包测试通过写成“已签名发布”。

## 9. 数据库身份与当前不支持的数据操作

Server 只创建当前库。`product_metadata` 必须精确绑定 application `host-monitoring`、version `0.7.0`、
schema revision `1` 与 SHA-256
`12dd1e61426b6b99df3d429b8c36ee3a5b22d1da776d98fc960b45b4f58c8e05`；现场 `sqlite_schema` 重新计算也
必须一致。当前 DDL 中管理员列是 `auth_users.username`，没有 `email` 或 role 列；DDL 自身约束 canonical
username、非空 password hash、`active IN (0,1)`，`serve`/`admin-create` 加载已有行时再用 Foundation
primitive 验证 username 和完整 current Argon2id 参数；DDL 还要求 `session_version > 0`，形成存储形状与
密码策略双层 fail-closed。数据库/
父目录/锁的
链接、特殊文件和硬链接
别名在 Linux 通过 `openat2` 锚定检查。`doctor` 还通过 Foundation 适配器执行完整
`PRAGMA integrity_check` 与 `foreign_key_check`；失败只报告 degraded 并退出，不在产品内修库。

产品仓不实现一致性备份、恢复或版本转换。`sarmg-upgrade` 当前只保留通用离线机制，尚未声明任何
Host Monitoring 转换边，因此当前没有受支持的 Host 数据迁移、备份或恢复流程。不得把“通用机制存在”
解释为可以处理本库，也不得自行只复制 SQLite 主文件、手改 metadata 或拼接 WAL。未来只有外部仓同时
声明精确输入/输出身份、锁、自己的 journal/原子性语义、验证和失败恢复合同后，对应操作才进入支持范围。

当前 retention worker 只处理 raw report 与 hourly aggregate。`audit_events` 没有读取、导出或清理 API；
过期/撤销的 `auth_sessions` 行没有全局清理 worker；invite/pairing 也只有创建新 pairing 时针对 expired
pending/旧 denied 的有界清理和删除 Host 时的定向清理。长期实例必须把这些控制面表的增长视为已知
运维缺口，不能误以为 `RAW_RETENTION_DAYS` 会覆盖它们，也不能在没有新合同/测试时手工删行。

## 10. 监控与故障处理

1. 检查 Server 的 systemd，以及 Agent 所在平台的 systemd/Windows Service/LaunchDaemon 状态和最近日志。
2. Server 检查 liveness、`/health/ready`；writer 停止时 readiness 必须失败。
3. 查看 429/503 与 `Retry-After`，区分准入限流、队列饱和和 writer 故障。
4. 查看严格错误 `code`：`unauthorized` 表示当前 credential 已失效并需显式重新配对；
   `agent_host_mismatch` 表示该报告 Host 与 credential 绑定不一致，只丢弃该报告。不能按 `message` 分支。
5. Agent 查看 `status`、spool 数量、当前 active binding、TLS 和系统时间。
6. 运行 Server/Agent doctor；Schema 不符时停止服务并保全原件。当前没有 Host 转换边，不要直接调用
   外部通用引擎尝试处理。
7. 容量规划同时监控 SQLite、WAL、spool、磁盘空间和 inode。

## 11. 安全事件与报告

先隔离公网入口和受影响 Agent，保全只读日志、发行摘要、数据库四元 identity、SQLite/WAL 文件现场与
状态目录权限，再轮换
管理员、Agent、mTLS、OTLP 等凭据。使用 GitHub Private Vulnerability Reporting；公开 issue 不得
包含生产遥测、主机标识、凭据或复现 Secret。安全支持仅覆盖当前发布版本和当前 `main`。

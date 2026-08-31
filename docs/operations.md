# Host Monitoring 运维文档

## 1. 服务端部署布局

```text
/opt/isarmg/host-monitoring/releases/0.7.0/   root 持有、只读发行树
/etc/isarmg/host-monitoring.env              0600 生产配置
/var/lib/isarmg/host-monitoring/db/app.db    SQLite 当前数据库
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

从干净、annotated `v0.7.0` 精确指向 HEAD 的 checkout，向仓库外已存在目录构建：

```bash
python3 scripts/package-server-release.py /absolute/output-directory
```

脚本构建 Web 和 Rust、写严格 manifest、生成 deterministic archive/checksum，随后解包、重定位、真实
启动、读取 hashed asset，并执行篡改拒绝。已有归档或 checksum 不会被覆盖。

## 3. Server 配置

所有变量使用 `HOST_MONITORING_` 前缀。核心项：

| 变量 | 默认/要求 | 说明 |
|---|---|---|
| `DATABASE_URL` | 必填 SQLite URL | 生产例 `sqlite:///var/lib/isarmg/host-monitoring/db/app.db` |
| `BIND` | `127.0.0.1:18105` | 非开发模式必须保持安全部署边界 |
| `STATIC_DIR` | 必填 | 正式环境必须精确等于发行树 `web/` |
| `DEVELOPMENT` | `false` | 仅本机开发可开启 |
| `BOOTSTRAP_ADMIN_EMAIL/PASSWORD` | 首次初始化 | 密码随后只保留 Argon2 摘要 |
| `SESSION_IDLE_TTL_SECONDS` | 1800 | 会话空闲期限 |
| `SESSION_ABSOLUTE_TTL_SECONDS` | 43200 | 会话绝对期限 |
| `TELEMETRY_QUEUE_CAPACITY` | 256，最大 1024 | 内存报告队列 |
| `TELEMETRY_BATCH_SIZE` | 64，最大 512 | 单事务报告数 |
| `RAW_RETENTION_DAYS` | 7 | 原始标量保留 |
| `AGGREGATE_RETENTION_DAYS` | 365 | 小时聚合保留，必须更长 |

其余 flush、enqueue、request、shutdown drain、retention interval/batch/transaction/time/yield 参数有代码
上限；不要用极端配置规避过载设计。

## 4. Server 日常命令

```bash
host-monitoring-server identity
host-monitoring-server verify-release --root /opt/isarmg/host-monitoring/releases/0.7.0
host-monitoring-server doctor
host-monitoring-server admin-create --database-url sqlite:///path/app.db
host-monitoring-server admin-reset-password --database-url sqlite:///path/app.db \
  --email admin@example.com --password '<new-secret>'
```

管理员维护要求 maintenance 排他锁，因此应停止运行实例。不要把密码放进 Shell history；生产中使用
受保护的交互/秘密注入方式。

## 5. Agent 配置与诊断

`config/host-monitor.json.example` 是当前完整字段样例。生产必须使用 HTTPS；`application_version` 必须
等于 `0.7.0`。默认采集 10 秒、慢速采集 30 秒、请求超时 10 秒、jitter 10%、spool 64 MiB。

```bash
host-monitor probe --config /etc/host-monitor/config.json
host-monitor status --config /etc/host-monitor/config.json --output json
host-monitor doctor --config /etc/host-monitor/config.json
host-monitor doctor --config /etc/host-monitor/config.json --doctor-delivery
```

本地 doctor 与 delivery doctor 含义不同；后者会真实发送报告，应在变更窗口使用。

## 6. Linux Agent

从工作区根构建并调用打包器：

```bash
cargo build --release -p host-monitor
NFPM_ARCH=amd64 clients/host-monitor/packaging/linux/build-packages.sh
```

包安装 `/usr/bin/host-monitor`、0600 配置、systemd unit 和显式 purge 工具。普通卸载保留身份与 spool；
确认不再需要当前状态后才运行 `host-monitor-purge`。NVIDIA 采集需要按包内
`host-monitor-gpu.conf` 明确配置设备访问，不能默认放宽整个服务沙箱。

## 7. Windows Agent

WiX 4 MSI 同时安装 Windows Service、Tray 和维护 helper。Tray 是用户交互外壳，Service 是持续采集
主体；两者通过受保护本机控制通道通信。构建/验收使用：

```powershell
host-monitor\packaging\windows\wix\build-msi.cmd
powershell -File host-monitor\packaging\windows\tests\Test-WixAuthoring.ps1
powershell -File host-monitor\packaging\windows\tests\Test-PeSubsystems.ps1
```

当前 MSI 不声明跨版本 UpgradeCode 家族，也不迁移旧状态。安装新版本前显式卸载和 purge 旧版本，再
安装并重新配对。安装失败必须由 MSI rollback 清理本次创建的服务和文件。

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

## 9. 数据库、备份和升级

Server 只创建当前库。`product_metadata` 必须绑定 `host-monitoring`、`0.7.0`、revision 1 与代码内固定
Schema SHA-256，现场 `sqlite_schema` 重新计算也必须一致。数据库/父目录/锁的链接、特殊文件和硬链接
别名在 Linux 通过 `openat2` 锚定检查。

一致性备份、验证、恢复和 `0.6.0 -> 0.7.0` 转换由 `sarmg-upgrade` 完成。恢复/升级前停止服务并取得
maintenance 排他锁；不要只复制 SQLite 主文件或手动修改 metadata。

## 10. 监控与故障处理

1. 检查 systemd/Windows Service/LaunchDaemon 状态和最近日志。
2. Server 检查 liveness、`/health/ready`；writer 停止时 readiness 必须失败。
3. 查看 429/503 与 `Retry-After`，区分准入限流、队列饱和和 writer 故障。
4. Agent 查看 `status`、spool 数量、当前 active binding、TLS 和系统时间。
5. 运行 Server/Agent doctor；Schema 不符转交外部升级工具。
6. 容量规划同时监控 SQLite、WAL、spool、磁盘空间和 inode。

## 11. 安全事件与报告

先隔离公网入口和受影响 Agent，保全只读日志、发行摘要、数据库 generation 与状态目录权限，再轮换
管理员、Agent、mTLS、OTLP 等凭据。使用 GitHub Private Vulnerability Reporting；公开 issue 不得
包含生产遥测、主机标识、凭据或复现 Secret。安全支持仅覆盖当前发布版本和当前 `main`。

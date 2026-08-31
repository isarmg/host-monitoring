# 02. 开发环境与第一次运行

## 2.1 工具链

仓库固定 Rust `1.98.0`。Server Web 需要 lockfile 对应的 Node 与 npm。Linux 常规开发可覆盖协议、服务
端和大部分 Agent 逻辑；Windows MSI、macOS pkg 以及真实平台采集仍由相应系统和 CI 验证。

```bash
rustup toolchain install 1.98.0
cargo +1.98.0 metadata --no-deps
cargo +1.98.0 check --workspace --locked --all-targets --all-features
cd clients/web
npm ci
npm run build
```

先使用 `--locked` 验证锁图，不要在普通功能修改中顺手升级依赖。

## 2.2 第一次启动 Server

为实验建立仅当前用户可访问的临时状态目录，准备 SQLite URL、Web `dist` 绝对路径、初始管理员和显式
开发模式。开发监听必须保持回环。不要复制生产数据库作为练习数据。

```text
HOST_MONITORING_DATABASE_URL=sqlite:///tmp/host-monitoring/app.db
HOST_MONITORING_STATIC_DIR=/absolute/repository/clients/web/dist
HOST_MONITORING_BOOTSTRAP_ADMIN_EMAIL=admin@example.com
HOST_MONITORING_BOOTSTRAP_ADMIN_PASSWORD=<local-only-secret>
HOST_MONITORING_DEVELOPMENT=true
```

```bash
cargo +1.98.0 run -p host-monitoring-server -- serve
```

开发命令与正式 `serve-release` 是不同安全边界。source-bound 正式二进制必须从验证过的固定发行树启动。

## 2.3 第一次运行客户端

从 `config/host-monitor.json.example` 创建仅用于临时环境的配置，设置当前 `application_version`、Server
HTTPS 地址和独立 state directory。按以下顺序理解命令：

```bash
cargo +1.98.0 run -p host-monitor -- probe --config /absolute/config.json
cargo +1.98.0 run -p host-monitor -- pair --config /absolute/config.json
cargo +1.98.0 run -p host-monitor -- status --config /absolute/config.json
cargo +1.98.0 run -p host-monitor -- once --config /absolute/config.json
```

`probe` 只证明采集；`pair` 需要管理员在 Web 批准；`status` 读取本地绑定；`once` 才同时覆盖采集和主通路
投递。不要跳过配对后把 401 当作采集器故障。

## 2.4 安全地观察状态

配置、active binding、pending pairing、spool 和锁文件都在 state directory 边界内。检查文件名、mode、
大小和时间可以帮助排障，但不要输出 credential 内容。测试结束后删除临时实验目录，不要让它与系统包
的生产目录重叠。

## 2.5 第一次成功的验收定义

一次完整练习应证明：Server readiness 正常；管理员能登录；Agent `probe` 返回受限合法报告；配对经
显式批准；`once` 返回成功；Web 能查询同一 Host 的 latest；重启 Agent 后继续使用同一当前绑定。

## 2.6 常见失败

| 现象 | 首查 |
|---|---|
| Web 404 | `STATIC_DIR` 是否为已构建绝对路径 |
| Server 拒绝数据库 | metadata、Schema、文件类型或实例锁 |
| Pair 一直 pending | 管理员是否批准、时钟和 Server URL |
| TLS 失败 | CA、主机名、证书时间，不要关闭验证绕过 |
| `once` 429/503 | Server 准入或 writer，Agent 应保留报告 |
| 第二实例失败 | state directory 锁，这是预期保护 |

## 2.7 练习后质量门

运行 `cargo fmt`、workspace check/test 和 Web build。此时只建立基线，不改 fingerprint、数据库或配置来
“让测试通过”。如果基线失败，先记录环境与错误层次。

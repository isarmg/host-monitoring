# Host Monitoring 主机监控

Host Monitoring `0.7.0` 是一个独立的主机遥测产品，仓库同时包含本地 Web 控制面、共享网络协议和
跨平台 `host-monitor`。服务端使用本地管理员账户和 SQLite；Agent 只读采集主机状态，通过配对取得
凭据，并经 HTTPS 发送有界报告。

产品只接受当前 `0.7.0` 配置、协议、SQLite Schema 和发行身份。服务端与 Agent 都不读取旧状态、
不注册旧路由，也不执行迁移、备份或恢复；跨版本操作由 `sarmg-upgrade` 离线完成。

## 仓库组成

```text
protocol/                  host-protocol：Agent/Server 唯一共享 wire contract
host-monitoring-server/    Axum API、Web 控制台、SQLite 写入与保留策略
clients/web/               React/Vite 管理客户端源码
clients/host-monitor/      桌面 daemon/CLI、移动宿主库、采集器和持久 spool
clients/host-monitor/packaging/    Linux、Windows、macOS 安装资产和生命周期测试
config/                    可提交的当前配置样例；不存放生产 Secret
scripts/                   发行打包、manifest 和供应链门禁
```

## 快速验证

```bash
cargo +1.98.0 fmt --all -- --check
cargo +1.98.0 check --workspace --locked --all-targets --all-features
cargo +1.98.0 clippy --workspace --locked --all-targets --all-features -- -D warnings
cargo +1.98.0 test --workspace --locked --all-targets --all-features
python3 scripts/check-workflow-supply-chain.py
python3 scripts/test-server-release-tooling.py
```

## 文档

- [文档总览](docs/README.md)
- [初学者学习指南](docs/beginner-guide/README.md)
- [项目工作流程与流程树](docs/project-workflow.md)
- [完整功能与取舍清单](docs/feature-inventory-and-tradeoffs.md)
- [部署、平台打包、安全和故障运维](docs/operations.md)

## 许可证

代码采用 Apache License 2.0，见 [LICENSE-APACHE](LICENSE-APACHE) 与 [NOTICE](NOTICE)。

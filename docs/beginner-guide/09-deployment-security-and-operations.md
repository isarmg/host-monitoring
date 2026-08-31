# 09. 部署、安全与生产运维

## 9.1 生产拓扑

Server 使用 root 持有的不可变版本目录，专用服务账户读取 0600 环境并写独立 SQLite 状态；默认回环
监听，由可信 TLS reverse proxy 暴露。Agent 使用各平台服务管理器和受保护本地状态，仅出站访问 Server。

## 9.2 上线前证据

保存代码 tag/revision、归档与 checksum、manifest verification、工具链、测试结果、配置摘要和回滚计划。
不要保存 Secret 本身。正式包从干净 annotated tag 构建，不能从开发工作树手工复制 binary。

## 9.3 Server 上线顺序

1. 停止或确认不存在同库旧实例。
2. 安装到新的精确版本目录，禁止覆盖。
3. 设置 root ownership 和不可写发行树。
4. 准备当前数据库或由升级仓安装已验证 generation。
5. 运行 `verify-release` 与 offline doctor。
6. 启动后检查 readiness、静态资源、登录和写入 smoke。

## 9.4 Agent 上线顺序

通过原生包安装，校验配置/状态权限，运行 `probe`，完成显式配对，再运行 `once`，最后启用长期服务。
不要把一台 Host 的 state directory 制作进镜像或批量复制。

## 9.5 日常监控

Server 关注 readiness、认证失败、配对准入、429/503、writer 延迟、队列、SQLite/WAL、retention backlog、
磁盘和 inode。Agent 关注服务状态、采集错误、spool 容量/最老条目、TLS、认证撤销和系统时钟。

## 9.6 备份与恢复

产品不实现 backup/restore/migration。使用 `sarmg-upgrade` 获取一致性 SQLite generation；Agent 本地身份
通常通过重新配对重建，是否备份必须按当前运维策略明确。恢复后先 offline doctor，再启动 Server 并
做端到端报告验收。

## 9.7 故障分级

| 现象 | 立即动作 |
|---|---|
| readiness 失败 | 从代理摘除，保全日志，检查 writer/数据库 |
| 大量 429 | 降低摄取、查队列与 writer，勿简单放大无界容量 |
| 大量 401 | 检查撤销/时间/配置，避免自动重新配对风暴 |
| spool 增长 | 查网络、TLS、Server 和磁盘，保持本地有界 |
| Schema/manifest 不符 | 停止，不手改；保全并交给外部升级流程 |
| Secret 疑似泄露 | 隔离、撤销/轮换、重新配对并审计影响范围 |

## 9.8 安全边界

TLS 私钥、管理员密码、设备 credential、OTLP Token 和数据库都按 Secret/敏感数据管理。日志与 support
包做字段级脱敏。只信任明确配置的代理和 CA；不因排障临时关闭证书验证或放开公网监听。

## 9.9 回滚

回滚不是让当前 binary 猜读另一代数据库。停止服务，依据持久升级 journal 用 `sarmg-upgrade` 明确
commit/rollback，再安装与该 generation 精确匹配的不可变制品。任何不确定状态都先保全证据。

## 9.10 安全事件记录

记录时间线、受影响 Host、发行 SHA、撤销/轮换动作和验证结果；公开 issue 不附生产配置、IP、报告、
数据库或 Secret。恢复服务前证明新凭据、当前发行和当前状态三者一致。

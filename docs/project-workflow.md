# Host Monitoring 工作流程与流程树

## 1. 总流程树

```text
Host Monitoring
├─ Server
│  ├─ 验证发行树/配置/当前 Schema
│  ├─ 管理员登录与 Session/CSRF
│  ├─ Agent 配对审批
│  ├─ 报告限流 -> 有界队列 -> 单 SQLite writer
│  └─ 原始报告 -> 小时聚合 -> 分层保留
├─ Desktop Agent
│  ├─ 读取当前配置并取得状态锁
│  ├─ 采集 CPU/内存/磁盘/网络/传感器
│  ├─ 本地有界 spool
│  └─ HTTPS 报告与可选 OTLP
├─ Mobile library
│  └─ 宿主快照 -> 合约收敛 -> JSON payload
└─ Delivery
   ├─ Linux deb/rpm + systemd
   ├─ Windows Service + Tray + MSI
   ├─ macOS LaunchDaemon + pkg
   └─ Server 不可变 tar release
```

## 2. Server 启动

正式进程先确认自己位于 `/opt/isarmg/host-monitoring/releases/0.7.0`，验证 manifest、完整源码 revision、
target、API、Schema、Web 文件集合/Hash/权限，再解析 `HOST_MONITORING_*`。随后取得数据库 instance
排他锁和 maintenance 共享锁；已有库先在只读隔离 generation 中验证 `product_metadata` 与实际
`sqlite_schema` 指纹，最后才打开写连接、启动 writer/retention 和 HTTP listener。

## 3. 管理员登录和配对

```text
管理员密码 -> Argon2 校验 -> SQLite Session + CSRF
  -> 浏览器创建/查看 pairing request
  -> Agent 以一次性 request/invite 轮询
  -> 管理员批准
  -> 服务端发放 Agent credential
  -> Agent 原子提交 active-binding.json
```

来源、设备、请求/邀请和管理员账户分别拥有有界准入预算；TCP peer 是来源事实，默认不信任 forwarded
address。相同 pairing request 重放幂等，单设备最多保留四个 live pending 请求。

## 4. Agent 采集与投递

长驻 Agent 读取严格 `application_version=0.7.0` 配置并锁定 state directory，初始化 host identity、
采集器和 spool 后才报告服务 ready。按基础/慢速周期生成报告，周期加入受限 jitter；报告先入 spool，
再通过当前 `/api/v2/host-monitor/report` 投递。关机信号停止新采集，并尽力收敛已拥有工作。

## 5. 服务端写入和过载

认证报告经过字段、Host、credential、report ID 和速率验证后，最多等待 10 ms 进入默认 256 容量队列。
单 writer 最多把 64 条放入一次事务，以 per-report savepoint 隔离撤销凭据或冲突 ID。队列满返回 429；
writer 停止、总等待超时或写入失败返回 503；两者带 `Retry-After: 1`。客户端断开不会取消已经入队、
归 writer 所有的工作。

## 6. 聚合与保留

```text
超过 raw retention 的非 latest 报告
  -> 按 Host + UTC 小时选择有界批次
  -> 幂等聚合 count/min/max/avg/区间
  -> 标记已纳入的 raw rows
  -> 独立事务有界删除
  -> 超过 aggregate retention 的小时行再删除
```

默认 raw 7 天、aggregate 365 天。崩溃在聚合和删除之间不会丢失或双计；每个 Host 的 latest report 永久
避开聚合删除。维护任务启动即运行，随后默认五分钟一次，并受事务数、行数、时间和 yield 预算限制。

## 7. 平台安装生命周期

- Linux：包创建专用账户、安装 0600 配置和 systemd unit；卸载保留状态，显式 purge 才删除本地状态。
- Windows：MSI 安装原生 Windows Service、无控制台 Tray 和维护 helper；Tray 通过本机受保护控制通道
  配置/配对，安装失败必须回滚。
- macOS：pkg 安装不可登录账户、LaunchDaemon 和日志轮转；卸载脚本验证路径和身份后清理，失败测试
  保证不会删除无关账户/文件。
- 移动平台：只交付 Rust 宿主库源码/构建合同，不执行系统安装生命周期。

## 8. Server 发行流程

```text
干净且 annotated v0.7.0 tag == HEAD
  -> npm ci + Web build
  -> source revision 绑定 Rust release build
  -> 严格全树 manifest
  -> deterministic archive + checksum
  -> 解包、重定位、真实启动和静态资源探测
  -> 篡改/额外文件/权限负例
```

归档没有 migration、backup 或 restore。版本目录不可覆盖，也没有 `current` 链接。

## 9. 维护流程

`doctor` 取得 maintenance 共享锁；`admin-create`、`admin-reset-password` 和外部有状态维护取得排他锁，
运行中的 Server 会让排他维护立即失败。升级时停止 Server 和 Agent，外部工具明确处理旧代；新产品
安装后重新配对，不让当前产品读取旧凭据。

# Host Monitoring 完整功能与取舍清单

## 0. 开发者决策台账

本表覆盖 Agent、Server、Web、协议、打包和运维。分类只能取“核心、保障、可选、建议保留、开发运维”；复杂度是删除或重构时需要同步修改并验证的闭包。隐藏客户端或 Web 入口不代表后端能力已删除。

| ID | 功能/特性与当前实现 | 实现/主要依赖 | 分类 | 复杂度 | 删除后的确定后果 | 最低验证 |
|---|---|---|---|---|---|---|
| HOST-001 | CPU、内存、磁盘、网络基础遥测采集 | `clients/host-monitor/src/collectors`、协议 DTO | 核心 | 高 | 失去主机健康的基本可观测性 | Linux/Windows 单位、边界、缺失值 |
| HOST-002 | Linux hwmon 温度/风扇采集 | sysfs/hwmon collector | 建议保留 | 中 | 基础负载仍在，但热故障不可见 | 无传感器、权限、设备变动 |
| HOST-003 | NVIDIA/NVML GPU 指标 | `nvidia` feature、设备权限、drop-in | 可选 | 高 | 非 GPU 主机无影响；GPU 温度/负载/显存消失 | 无驱动、权限、重载、单位 |
| HOST-004 | Windows PDH/GPU 采集与 recovery | PDH buffer、Windows collector | 可选 | 高 | Windows 基础指标可保留但 GPU/特定计数器缺失 | counter 重建、缓冲增长、locale |
| HOST-005 | 周期采集和结构化 report contract | monitor runtime、`protocol/` | 核心 | 高 | Agent 无法形成 Server 可接受的报告 | 版本、时间戳、重复/缺字段 |
| HOST-006 | HTTPS 上报且拒绝不安全 transport | transport、rustls/reqwest、配置 | 保障 | 中 | 放宽会泄露 pairing token 和主机遥测 | HTTP、错证书、超时 |
| HOST-007 | 有界磁盘 spool | spool、state dir、原子文件 | 保障 | 高 | Server 短暂不可达时丢数据；无界实现会写满磁盘 | 满额、重启、损坏条目、顺序 |
| HOST-008 | delivery retry/backoff 与 jitter | reporter/runtime、transport 分类 | 保障 | 高 | 瞬时错误造成持续丢数或请求风暴 | 429/5xx/网络错误、恢复 |
| HOST-009 | at-least-once 投递和 Server 去重 | report ID、spool、ingest 唯一约束 | 保障 | 高 | 重试会重复写入或错误丢弃 | 重复、乱序、崩溃边界 |
| HOST-010 | 配置严格解析与显式路径 | `config/host-monitor.json.example`、config.rs | 保障 | 中 | 拼错配置可能静默生效；自动搜索会读取意外文件 | unknown field、权限、相对路径 |
| HOST-011 | state directory 私有化和原子状态写入 | private_fs、atomic_file、state_lock | 保障 | 高 | token/spool 可被其他用户读取或状态半写 | mode/owner/symlink/hardlink/断电 |
| HOST-012 | 本地单实例锁 | state_lock、service host | 保障 | 中 | 两个 Agent 会重复采集和投递、争用 spool | 双启动和异常锁文件 |
| HOST-013 | 配对 create/poll/activate/commit 状态机 | pairing modules、Server API | 核心 | 高 | 新 Agent 无法取得绑定身份 | 过期、取消、重复、重启 |
| HOST-014 | 配对凭据只在 commit 后持久化 | pairing state/storage、atomic file | 保障 | 高 | 半完成 pairing 可能留下可用凭据或丢失绑定 | 每个崩溃点故障注入 |
| HOST-015 | 配对 admission、速率和一次性 code | Server pairing tables/routes | 保障 | 高 | 未授权 Agent 可大量申请或重放 code | 过期、重放、来源预算 |
| HOST-016 | Agent status/diagnostics | diagnostics、CLI/tray | 建议保留 | 中 | 运维只能查日志，无法快速确认绑定与队列 | 离线、损坏状态、无权限 |
| HOST-017 | Linux systemd service 生命周期 | packaging/linux、unit、scripts | 开发运维 | 高 | Linux 需手工保持进程和账户权限 | 安装/升级外的当前安装、卸载、清理 |
| HOST-018 | Windows service、tray 和本地控制面 | Win32、tray/control、WiX | 可选 | 高 | Windows 后台 Agent 或图形配置入口消失 | ACL、service/tray IPC、MSI lifecycle |
| HOST-019 | macOS LaunchDaemon 和 Installer pkg | packaging/macos、launchd | 可选 | 高 | macOS 无受支持安装/卸载路径 | account safety、pkg、失败回滚 |
| HOST-020 | 移动宿主库边界 | `mobile.rs`、共享 protocol | 可选 | 中 | 不能嵌入移动宿主，桌面 Agent 不受影响 | 生命周期、字段、线程边界 |
| HOST-021 | Server 本地管理员认证 | auth users、Argon2、routes | 核心 | 高 | 管理 UI/API 无身份边界 | 正误密码、未知账号、预算 |
| HOST-022 | Session/CSRF/Origin 保护 | browser sessions、middleware | 保障 | 高 | 浏览器登录可被窃取、跨站利用或无法撤销 | TTL、撤销、unsafe method |
| HOST-023 | `/api/v2/host-monitor` 唯一 Agent/API 合同 | Server router、protocol crate、client | 核心 | 高 | Agent 与 Server 无稳定交互；alias 会重引旧兼容 | current path、旧 path 404、unknown field |
| HOST-024 | Server ingest 严格验证和事务写入 | telemetry writer、SQLite | 核心 | 高 | 不可信 Agent 数据可污染库或整批丢失 | size、单位、timestamp、rollback |
| HOST-025 | 数据保留与有界清理 | retention config、maintenance task | 保障 | 中 | 数据库无限增长；删得过激则趋势数据消失 | 时间边界、批量、锁竞争 |
| HOST-026 | Host 列表、当前状态和历史查询 | Server API、queries、Web | 核心 | 高 | 已采集数据无法形成可用监控视图 | 空集、分页、权限、时区 |
| HOST-027 | React/Vite 管理控制台 | `clients/web`、Server static dir | 建议保留 | 中 | API 保留，但没有内置查看/管理界面 | build、auth、图表空态 |
| HOST-028 | SQLite 当前 Schema identity/doctor | metadata、integrity/FK、doctor | 保障 | 高 | 错库/漂移库可被误用 | wrong SHA/version、sidecar、corruption |
| HOST-029 | Server 单实例和 maintenance lock | runtime lock、数据库锁 | 保障 | 高 | 双 Server 可重复清理/写入并破坏一致性 | 双启动、维护冲突 |
| HOST-030 | source-bound release 与 Web fingerprint | package script、release manifest | 开发运维 | 高 | 二进制和 Web 可能混代，来源不可证明 | missing/extra/tamper/relocate |
| HOST-031 | Linux/macOS/Windows 安装生命周期测试 | packaging tests | 开发运维 | 高 | 权限、账户、卸载回归可能进入发行 | 各平台 clean fixture |
| HOST-032 | CI Rust/Web/protocol/supply-chain 门禁 | `.github/workflows/ci.yml` | 开发运维 | 中 | 跨组件合同漂移无法提前发现 | clean checkout 全门禁 |
| HOST-033 | 中文学习、流程、功能和运维文档 | README、`docs/` | 开发运维 | 低 | 开发者难以理解跨平台边界 | 链接和命令抽查 |
| HOST-034 | 明确不做远程执行、配置下发、自动旧 Agent 兼容 | 不存在对应 route/command | 核心 | 高 | 新增会把只读遥测 Agent 变成远控系统并扩大威胁面 | 独立威胁模型与协议设计 |

## 1. Server 能力

| 功能 | 当前实现 | 取舍/限制 |
|---|---|---|
| 管理身份 | 本地管理员、随机 Session、CSRF、RBAC | 不依赖中央账户或共享 Session |
| 配对 | 浏览器审批、一次性秘密、分维度限流、幂等请求 | 当前版本需重新配对旧 Agent |
| 报告 API | `/api/v2/host-monitor` 当前协议 | 无旧 `/agent/v1`、`/agent/v2` alias |
| 写入 | 有界队列、单 writer、batch、savepoint | 单库单活进程，不是分布式写集群 |
| 历史 | raw 报告、UTC 小时聚合、两级保留 | 聚合只覆盖标量，不是任意时序查询引擎 |
| Web | 独立 React/Vite 控制台，编译进发行物 | 不支持运行时插件或远程共享 UI |
| 诊断 | health/readiness、doctor、审计 | 不提供产品内数据库修复 |
| 发布 | source-bound binary、全树 manifest、固定目录 | 同版本不可原地覆盖 |

## 2. Agent 能力

| 平台/领域 | 能力 | 边界 |
|---|---|---|
| Linux | CPU、内存、磁盘、网络、hwmon、NVIDIA；systemd/deb/rpm | GPU 需要显式放宽 PrivateDevices drop-in |
| Windows | 系统指标、PDH/GPU、Windows Service、Tray、WiX MSI | 不使用控制台子系统冒充后台服务 |
| macOS | 系统指标、LaunchDaemon、pkg、newsyslog | 账户和卸载遵循平台安全检查 |
| Android/iOS/iPadOS | 宿主提供快照的 Rust contract library | 无 App 外壳、签名、权限或 APK/IPA |
| 可靠性 | 单实例状态锁、原子凭据、64 MiB 默认 spool | 有界队列会在持续故障时施加容量压力 |
| 网络 | HTTPS、可选 mTLS 材料、自定义 CA、可选 OTLP | 明文 HTTP 只允许显式本地开发 |
| 操作 | run/once/probe/pair/status/doctor | Agent 不提供远程命令执行 |

## 3. 关键架构取舍

- SQLite 适合单机独立控制面，部署简单；代价是必须通过单 writer 和有界任务控制写竞争，不能水平多写。
- raw + hourly aggregate 控制数据库增长；代价是过期原始样本无法逐点查询。
- Agent 先落本地 spool，网络故障不立即丢数据；代价是本机需要保护和监控状态容量。
- 移动端采用宿主驱动 library，而非强行常驻 daemon；符合平台限制，但采样完整性和周期由 OS 决定。
- 三平台提供原生安装资产，而非容器；能接触真实主机传感器和服务管理，运维矩阵更大。
- Server 与 Agent 同仓共享协议，消除版本漂移；代价是协议变化需要联合发布和完整矩阵验证。

## 4. 当前版本与明确不做

- 只接受 `0.7.0` 配置、状态与数据库；不转换旧文件或维护 compatibility alias。
- 服务端只初始化缺失的当前库，拒绝 metadata-free、旧版本和 Schema drift。
- 产品不包含 migration、backup、restore；由 `sarmg-upgrade` 处理。
- Agent 不执行远程 Shell、配置修改、补丁管理或自动修复。
- 移动库不持久化 Token，不实现网络客户端或后台调度。
- 不通过共享运行时、中央网关、共享数据库或 CDN 依赖其他 Sarmg 项目。

## 5. 安全取舍

服务端默认回环监听，由可信 TLS 代理公开；浏览器与 Agent 身份分离。Agent 凭据、spool 和可选 OTLP
Token 是敏感数据。管理员操作和遥测不应记录 Secret。只有当前发布版本和 `main` 接受安全修复；漏洞
应使用 GitHub Private Vulnerability Reporting，公开 issue 不得包含凭据或生产数据。

## 6. 端到端能力地图

| 阶段 | Agent 行为 | Server 行为 | 操作者看到的证据 |
|---|---|---|---|
| 安装 | 原生包创建服务、账户、配置和状态边界 | 安装不可变 Server release | package 生命周期测试、release verify |
| 采集验证 | `probe` 读取当前平台指标 | 无网络参与 | 有界报告摘要与分类错误 |
| 配对 | 保存 pending、轮询并原子提交 binding | 管理员审批并发放 credential | Web 审批、`status` active |
| 日常报告 | 采集 -> spool -> HTTPS batch | 认证 -> queue -> writer -> commit | `once`/服务日志、latest 时间 |
| 历史查询 | 无 | raw、hourly aggregate、latest | Web/API 图表与保留指标 |
| 诊断 | `status`/`doctor`/delivery doctor | health/readiness/doctor | 机器可读结果、request/report ID |
| 升级 | 停止、清理或重新配对当前客户端 | 停止并外部转换数据库 | `sarmg-upgrade` verify + product doctor |

## 7. 指标覆盖与缺失语义

| 类别 | 典型内容 | 平台差异 | 不提供/注意 |
|---|---|---|---|
| CPU | 总体/核心利用、负载相关事实 | OS 计数器来源不同 | 不把采样间隔差异伪装成同一瞬时值 |
| 内存 | 总量、可用、使用 | cache/available 定义依平台 | 单位必须明确，不用负值/溢出 |
| 磁盘 | 卷容量和使用 | mount/drive 模型不同 | 不是磁盘健康/S.M.A.R.T. 管理器 |
| 网络 | 接口计数与速率基础 | 接口命名和重置不同 | 不抓包、不检查用户内容 |
| 温度/传感器 | Linux hwmon 等可用事实 | 设备/权限依赖强 | 缺失表示未支持/不可用，不填零 |
| GPU | NVIDIA/Windows GPU 等受支持来源 | 驱动和 sandbox 影响 | 不是通用 GPU 调度或诊断工具 |

报告只表达当前协议定义的有界字段。新增传感器必须说明单位、采样成本、缺失/重置语义、集合上限、隐私
影响、三桌面平台策略以及聚合方式。

## 8. 配对与凭据功能明细

| 能力 | 当前保证 | 明确边界 |
|---|---|---|
| Pending 持久化 | 网络中断恢复同一请求 | 不静默生成多套身份 |
| 管理员审批 | 浏览器身份显式授权 | 设备不能自批 |
| 一次性 Secret | 只用于请求激活 | 不是长期报告 credential |
| Active binding | 临时文件、sync、原子替换 | 不从半写文件“尽量恢复” |
| 撤销 | Server 拒绝后续报告 | Agent 不无界重试被撤销 credential |
| 重新配对 | 用户明确动作建立新当前身份 | 不读取另一个版本状态 fallback |
| 准入 | 来源/设备/请求/邀请/管理员独立预算 | 不能只靠单 IP 限流 |

## 9. 报告可靠性与容量

| 层 | 有界资源 | 满/失败语义 | 为什么这样取舍 |
|---|---|---|---|
| 采集 | 字段、集合、字符串、执行时间 | 缺失或分类错误 | 防异常系统接口制造无界 JSON |
| Agent spool | 默认 64 MiB、条目/单报告边界 | 保持可观察压力，不无限占盘 | 短期断网恢复与主机安全平衡 |
| HTTP | body、timeout、认证/速率 | 4xx/429/503 精确分类 | 防慢请求与风暴 |
| Server queue | 默认 256、短入队等待 | 429/503 + Retry-After | 显式 backpressure |
| Writer batch | 默认 64、等待/事务预算 | 单报告 savepoint 隔离 | 降低 fsync 同时限制长事务 |
| Retention | 行/事务/时间/yield | 分批下次继续 | 不让维护阻塞实时摄取 |

## 10. 平台交付清单

### 10.1 Linux

提供 deb/rpm、systemd unit、专用账户、0600 配置、显式 GPU drop-in、卸载保留状态与 purge 工具。生命周期
测试覆盖安装、升级边界、remove、purge、失败清理与路径权限。没有容器替代，因为 Agent 需要观察真实 Host。

### 10.2 Windows

提供原生 Windows Service、无控制台 Tray、维护 helper 与 WiX MSI。Service 长期采集，Tray 只做交互，
本机 IPC 受保护。测试检查 WiX authoring、PE subsystem、安装/回滚/卸载和服务状态。

### 10.3 macOS

提供 pkg、不可登录账户、LaunchDaemon 与 newsyslog。脚本验证账户/路径归属，失败不得删除无关同名资源。
测试覆盖 pre/postinstall、失败回滚、卸载证明和日志配置。

### 10.4 移动库

仅提供 Android/iOS/iPadOS Rust target 的纯宿主 contract。没有 App UI、签名、权限、网络、Secret 存储或
后台保证；这些必须由真实移动产品实现后才能宣称“移动客户端”。

## 11. 数据保留与查询取舍

| 数据层 | 用途 | 默认保留 | 精度/限制 |
|---|---|---|---|
| latest | 当前 Host 状态 | 永不被 raw 清理删除 | 每 Host 一条稳定裁决结果 |
| raw | 短期逐次报告 | 7 天 | 可精确查看，但增长快 |
| hourly aggregate | 长期趋势 | 365 天 | 只保留支持标量的 count/min/max/avg |
| audit/session/pairing | 安全与控制状态 | 按当前代码策略 | 不等同于遥测时序数据 |

聚合先幂等纳入再删除 raw，崩溃不能双计或丢计。UTC 小时避免时区/DST 歧义；UI 才转换本地时间。项目
不提供任意 PromQL/SQL、多年逐秒数据或分布式时序集群。

## 12. 安全和隐私分类

| 对象 | 分类 | 保护/日志规则 |
|---|---|---|
| 管理员密码/Session/CSRF | Secret | Argon2/随机摘要；不记录明文 |
| 设备 credential/TLS 私钥 | Secret | 受保护状态目录；日志只写受限 ID |
| OTLP Token | Secret | 与设备 credential 分离 |
| Spool 报告 | 敏感主机数据 | 最小权限、有界、成功后清理 |
| SQLite 历史 | 敏感资产/运行画像 | 专用账户、备份访问控制 |
| Host 名称/硬件/接口 | 可能识别基础设施 | support 包和公开 issue 脱敏 |

## 13. 候选功能决策

| 候选 | 当前决定 | 理由 |
|---|---|---|
| 远程 Shell/修复 | 不提供 | 把只读 Agent 变为高危控制代理 |
| 补丁管理 | 不提供 | 需要独立授权、回滚和软件供应链模型 |
| 多 Server active-active | 不提供 | SQLite/credential/report 幂等模型是单控制面 |
| 无限本地缓存 | 不提供 | 网络故障会耗尽主机磁盘 |
| 移动常驻 daemon | 不提供 | 不符合 Android/iOS 后台模型 |
| 旧 Agent API alias | 不提供 | 扩大协议和安全测试矩阵 |
| 自动硬件告警规则 | 当前不提供 | 需明确规则状态、抑制、通知和时钟语义 |

## 14. 功能完成定义

一项 Server/Agent 功能必须同时具备协议合同、两端实现、容量与失败语义、身份授权、持久恢复、平台差异、
指标/doctor、正负测试、安装/发行证明、升级资源合同和中文文档。仅采集到一个值或页面能显示不算完成。

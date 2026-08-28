# Union Host Monitoring

Union Host Monitoring 是 Union 的主机配对与遥测业务模块源码仓库。仓库独立维护和版本化，
但不构成可直接暴露到公网的独立产品：Union Builder 在发行构建阶段固定此仓库的不可变
commit 并打包模块，Union Core 在运行阶段负责启动、监管和停止其私有 Worker。

## 仓库结构

| 路径 | 作用 |
|---|---|
| `host-monitoring-worker/` | Backend、动态 Frontend、Manifest、权限、配置 Schema、PostgreSQL migration 和版本元数据 |
| `protocol/` | `unionc-protocol`，远端 Union Agent 与 Host Worker 共用的稳定 JSON 线协议 |

两个 crate 组成同一个 Rust workspace，版本均为 `0.5.0`。Worker 包名保持
`union-host-monitoring-worker`；协议包名保持 `unionc-protocol`。Union Agent 应通过精确
commit 固定协议依赖，例如：

```toml
unionc-protocol = { git = "https://github.com/isarmg/host-monitoring.git", rev = "<immutable-commit-sha>" }
```

禁止使用分支或可移动 tag 作为发行依赖。协议 crate 只定义序列化 DTO 和线级约束，不包含
采集、HTTP、鉴权或持久化逻辑。

## 部署边界

- Union Core 是唯一公网入口；Worker 只能监听 loopback，不能配置独立公网监听或反向代理站点。
- Worker 只接受 Union 为当前进程生成并注入的 `gateway-v1` 身份，拥有独立 PostgreSQL
  database/schema，不访问 Core 或其他模块的数据。
- 管理台激活使用平台认证端点 `/agent/v2/activate-admin`；远端 Agent/Tray 使用模块能力端点
  `/agent/v2/activate`。两者消费相同类型的一次性激活码，但鉴权边界不能合并。
- Agent 报告、配对创建/读取/状态以及 Agent 激活保留模块领域认证；其他管理路由由 Union
  会话、RBAC 与 CSRF 保护。
- 动态前端是 Builder 纳入 Union 发行的可信同源代码，不是第三方 JavaScript 沙箱。

完整运行契约、迁移和本地测试命令见
[`host-monitoring-worker/README.md`](host-monitoring-worker/README.md)。

## 验证

本地使用仓库固定的 Rust 1.98 工具链兼容目标执行：

```console
cargo fmt --all -- --check
cargo check --locked --workspace --all-targets
cargo test --locked --workspace
cargo clippy --locked --workspace --all-targets -- -D warnings
node --test host-monitoring-worker/frontend/entry.test.mjs
```

Rust 集成测试同时验证 Manifest 中的双激活端点、平台权限和五个模块认证路由。CI 固定
Rust `1.98.0`，避免 `stable` 漂移改变构建结果。

## 许可证与安全

本仓库由单一作者 `sarmg <isarmg@163.com>` 以 Apache License 2.0 发布。许可证正文见
[`LICENSE-APACHE`](LICENSE-APACHE)，安全问题请按 [`SECURITY.md`](SECURITY.md) 私下报告。

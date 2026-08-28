# 安全策略

## 报告漏洞

请不要通过公开 issue 报告安全漏洞。请使用 GitHub 的
[Private vulnerability reporting](https://github.com/isarmg/host-monitoring/security/advisories/new)。
若该渠道暂不可用，请只在 issue 中请求私下联系方式，不要披露复现细节、凭据或用户数据。

报告请包含受影响版本或 commit、复现步骤、部署方式和影响范围。仅当前发布版本接受安全修复。

## 安全边界

- Union Core 是唯一公网入口。Host Worker 只能绑定 loopback，并要求当前进程唯一的
  `gateway-v1` 协议、audience、token 和 forwarded prefix；其端口不是公共 API。
- `gateway-v1` token 只证明请求来自监管该进程的 Union Core，不代表管理员或 Agent 身份。
  平台路由还必须携带 Core 校验后的 canonical principal；Agent 路由仍验证领域凭据。
- 浏览器管理激活端点为 `/agent/v2/activate-admin`，受 Core 会话、
  `host-monitoring.agents.write` 与 CSRF 保护；Agent/Tray 使用独立的
  `/agent/v2/activate` 能力端点。不得把后者改成浏览器会话旁路。
- Worker 使用模块专属 PostgreSQL database/role 和 migration。不得读取或修改 Core 或其他
  模块数据库；数据库 URL、进程 token、Agent token 和一次性配对凭据不得写入日志或仓库。
- 动态前端属于 Builder 验证的可信发行代码；同源 ESM 不提供恶意插件隔离。
- 独立进程提供崩溃、数据所有权和生命周期边界，不等同于不同 OS 身份、容器或沙箱。

生产部署必须由 Union 生成完整发行、覆盖所有外部内部头并终止 TLS。不得为 Worker 配置
独立公网反向代理，也不得绕过 Manifest 网关。

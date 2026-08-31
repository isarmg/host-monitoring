# 08. 测试、调试与安全变更方法

## 8.1 先确定变化落在哪条链

修改前写出从输入到持久化/展示的路径。协议字段涉及 protocol、Agent、Server、Web；平台采集涉及目标
系统 fixture；安装涉及服务账户和回滚；Schema 涉及 fingerprint、doctor 与升级仓。只改“最明显文件”
通常会留下不一致合同。

## 8.2 本地基础门禁

```bash
cargo +1.98.0 fmt --all -- --check
cargo +1.98.0 check --workspace --locked --all-targets --all-features
cargo +1.98.0 clippy --workspace --locked --all-targets --all-features -- -D warnings
cargo +1.98.0 test --workspace --locked
cd clients/web
npm ci
npm run build
```

再运行仓库提供的 workflow、打包和平台静态测试。`cargo check` 成功不能代替测试，单元测试成功也不能
证明安装生命周期。

## 8.3 分层调试

1. `probe` 验证采集。
2. `status` 验证本地状态与配对。
3. `once` 验证 spool 和主投递。
4. Server readiness/日志验证准入与 writer。
5. 数据库/API 验证 latest/raw。
6. Web 验证展示。

每次只跨一层，避免用“重装一切”掩盖原因。

## 8.4 可靠性测试方法

使用临时目录和受控假 Server 注入：连接拒绝、响应丢失、429/503、认证撤销、磁盘满、部分文件、进程
崩溃和时钟边界。测试重启后状态，而不仅是错误返回当下。

## 8.5 并发测试

覆盖同一 state directory 双实例、重复配对、多个 report 并发、writer queue 满、retention 与摄取并行、
管理员维护锁冲突。断言最终状态、响应分类和资源上限，而非依赖任务恰好执行顺序。

## 8.6 安全测试

包含链接/特殊文件/硬链接、宽权限目录、超大 JSON、unknown fields、CSRF/Origin、forwarded spoof、Secret
redaction、TLS 验证和安装脚本路径替换。安全负例必须与功能正例同等重要。

## 8.7 版本与名称变更

破坏性变更应全量替换 crate/binary/package/service/API/配置/文档/测试/发行 identity，删除旧入口。用
全文和文件路径搜索审计，再构建真实包；仅 Cargo metadata 成功不足以证明安装资产已同步。

## 8.8 提交前检查表

- 工作树只包含本问题相关修改。
- 格式、编译、Clippy、测试、Web 和脚本全部通过。
- 当前名称与版本全局唯一，忽略构建目录后旧身份搜索为零。
- 文档命令确实存在，链接可解析。
- 没有凭据、真实主机数据、target/node_modules 或临时包。
- 大问题形成可独立回滚的提交。

## 8.9 代码评审提问

失败发生后谁拥有任务？容量是否有上限？客户端超时能否断言未执行？Secret 会流向哪里？崩溃后读取
哪个事实源？当前版本不匹配时是否 fail closed？这些问题比“代码看起来简洁”更能揭示缺陷。

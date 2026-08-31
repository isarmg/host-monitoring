# 04. 服务端请求、登录与配对链路

## 4.1 启动先于请求

正式 Server 在绑定端口前验证物理发行路径、全树 manifest、源码 revision、target、API/Schema 身份、
Web 文件和权限；再解析环境、取得数据库 instance 排他锁与 maintenance 共享锁、验证当前数据库，最后
启动 writer、retention 和 listener。失败发生得越早，越不容易产生半启动状态。

## 4.2 浏览器登录

```text
TCP peer + bounded body
 -> source/account/global admission
 -> bounded Argon2 verification
 -> SQLite Session digest
 -> Secure Cookie + CSRF plaintext
```

未知账户仍执行等价成本密码工作，降低用户名枚举侧信道。写请求同时验证 Session、CSRF、Origin/Host；
forwarded address 默认不是可信来源事实。

## 4.3 配对的参与者

Agent、管理员浏览器和 Server 共同完成配对。Agent 创建一次性请求并持久保存 pending；管理员看到设备
摘要后明确批准；Server 只向持有一次性秘密的一方交付 credential；Agent 原子写入 active binding。

## 4.4 配对状态机

```text
none -> pending -> approved -> activated -> active
          |           |            |
          + expired   + rejected   + local commit failed/recoverable
```

网络中断后必须恢复同一 pending request，而非自动生成多个身份。替换未完成请求需要显式用户动作。Server
对来源、设备、邀请码和管理员分别限流，防止一个维度绕过另一个维度的预算。

## 4.5 报告请求链路

设备 Bearer credential 通过摘要查找和撤销检查后，Server 严格解码报告，验证 Host 绑定、report ID、
版本、时间和字段边界，再尝试在短时预算内进入有界队列。未入队返回 429/503；入队后 writer 拥有任务。

## 4.6 为什么不能直接在 handler 写 SQLite

每个请求独占写事务会放大 SQLite 竞争，并允许网络并发直接决定内存和连接数。单 writer 加有界队列把
并发转为可观察的背压，batch 提高吞吐，per-report savepoint 隔离单个冲突或撤销。

## 4.7 响应的精确含义

- `202`：报告事务已提交，不只是进入队列。
- `401/403`：身份或授权失败，不能无界重试。
- `409/422`：当前请求与状态/合同冲突，需修正源数据。
- `429`：准入容量不足，遵循 `Retry-After`。
- `503`：writer 或依赖不可用，保留同一报告后重试。

## 4.8 调试顺序

先以 request/report ID 串联日志，再按认证、严格解码、准入、队列等待、writer savepoint、事务提交定位。
禁止打印 credential 或整份报告来换取便利；应记录受限字段摘要和分类错误。

## 4.9 变更检查

新增路由需明确公开/管理员/设备身份、body 上限、超时、来源事实、CSRF、错误 envelope 和负例。当前 API
发生破坏性变化时直接更新所有调用方与测试，不注册另一条旧路径。

# 07. 当前报告协议、写入与保留

## 7.1 协议层次

配对协议建立设备身份；报告协议提交遥测；管理员 API 查询 Host、latest、raw 和 aggregate。三类路由的
身份、速率和数据暴露不同，不能共用一个“万能 token”。

## 7.2 报告不变量

- 当前应用/协议版本精确匹配。
- Host 与 credential 绑定且未撤销。
- report ID 合法且稳定。
- 时间和所有集合/字符串/数值在边界内。
- 重放相同事实可幂等处理；相同 ID 不同内容必须冲突。

## 7.3 服务端所有权转移

```text
HTTP body -> validation -> bounded queue -> writer batch -> savepoint -> transaction commit -> 202
```

只有进入队列后 writer 才拥有完成责任；客户端断开不取消该责任。队列前失败没有写入承诺，事务失败也
不能返回成功。

## 7.4 Batch 与 Savepoint

writer 将有限报告放入一个事务以降低 fsync 成本；每条使用 savepoint，让一个撤销 credential、冲突 ID
或非法关联不会撤销其他独立报告。Batch 大小和等待时间有上限，避免低流量长期滞留或高流量独占。

## 7.5 Latest 语义

latest 表示每个 Host 当前选定的最新有效报告，不等同于数据库最后插入行。乱序、重试和相同时间需要
稳定裁决。保留任务永远不能删除 latest 所依赖的行，否则在线状态会因清理跳变。

## 7.6 小时聚合

超过 raw 保留期的非 latest 报告按 Host 与 UTC 小时分桶，计算 count/min/max/avg 等受支持标量。聚合
必须幂等记录已纳入范围，再在独立有界事务删除 raw；崩溃在两步之间不能双计或丢计。

## 7.7 保留预算

维护任务按时间、事务、行数和 yield 预算分批工作，启动时执行后按周期运行。不能一次扫描/删除全库，
否则会挤压实时 writer。raw 与 aggregate 期限必须满足当前配置约束。

## 7.8 过载观测

监控队列深度、入队等待、429/503、batch 大小、事务延迟、spool 字节、最老待发时间、raw/aggregate 行数
和 maintenance 用时。单看 CPU 无法发现可靠性退化。

## 7.9 Schema 变化

产品只创建缺失的当前数据库，并验证 `product_metadata` 与现场规范 DDL fingerprint。新版本需要新当前
Schema 时直接更新代码、测试和升级仓 adapter；Server 不执行 `ALTER TABLE` 或接受 metadata-free 库。

## 7.10 协议变更验收

除正例外必须测试：unknown field/版本、极值、空集合、超长文本、大整数、重复 ID 不同内容、撤销竞态、
队列满、writer 停止、事务失败、乱序与保留崩溃恢复。

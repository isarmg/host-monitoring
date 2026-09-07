# 本地管理服务

仅启动 Host Monitoring Server 及其管理 Web，不自动安装或启动采集 Client。
开发服务监听 `http://127.0.0.1:18105`，使用当前认证和 loopback HTTP Cookie。
不用于生产部署，不修改系统服务，也不占用 Sunshine 的 18104 端口。

在仓库根执行：

```sh
npm --prefix clients/web run build
CARGO_INCREMENTAL=0 CARGO_PROFILE_DEV_DEBUG=0 CARGO_BUILD_JOBS=2 HOST_MONITORING_SOURCE_REVISION=unbound cargo build --locked -p host-monitoring-server
node scripts/local-service.mjs start
node scripts/local-service.mjs status
node scripts/local-service.mjs stop
```

首次启动生成随机管理员密码，账号为 `admin`。凭据在
`.runtime/local-service/login.txt`，文件权限为 0600；请在本机读取，不提交或分享。
数据库位于 `.runtime/local-service/db/host-monitoring.sqlite3`，日志位于
`.runtime/local-service/server.log`。所有运行状态由 Git 忽略，重复启动复用原有数据库和凭据。
重新构建二进制前先停止本服务；Web 静态资源由 `clients/web/dist` 提供。

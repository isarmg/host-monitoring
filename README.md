# Host Monitoring

Host Monitoring is an independent product containing:

- `host-monitoring-server`: local web control plane with administrator accounts and sessions.
- `host-protocol`: stable JSON wire types shared by the server and agent.
- `host-m-agent`: cross-platform read-only host telemetry agent.
- `web/`: small standalone management page compiled into the server.

The server and agent communicate over the project's own pairing and report endpoints. They do
not depend on a central runtime or a shared session service.

## Build

```bash
cargo build --workspace --release
```

## Run the server

```text
HOST_MONITORING_DATABASE_URL=sqlite:///var/lib/isarmg/host-monitoring/db/app.db
HOST_MONITORING_SESSION_SECRET=<base64 at least 32 bytes>
HOST_MONITORING_BOOTSTRAP_ADMIN_EMAIL=admin@example.com
HOST_MONITORING_BOOTSTRAP_ADMIN_PASSWORD=<initial admin password>
```

```bash
host-monitoring-server serve
```

## Backup and restore

`backup-create` uses SQLite's online backup API, refuses to overwrite an existing output and
verifies integrity, foreign keys and the Host Monitoring schema. `backup-verify` performs the same
checks read-only. Stop the server before `restore`; it reconstructs and verifies the backup beside
the destination before atomically replacing the database.

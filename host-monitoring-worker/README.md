# Host Monitoring Server

The Host Monitoring server is an independent control plane for the cross-platform
`host-m-agent`. It stores monitored hosts, telemetry, agent credentials and audit events
in its own PostgreSQL database.

## Build

From the repository root:

```bash
cargo build --release -p host-monitoring-server
```

## Run

Environment variables use the `HOST_MONITORING_` prefix:

```text
HOST_MONITORING_DATABASE_URL=postgresql://...
HOST_MONITORING_SESSION_SECRET=<base64 at least 32 bytes>
HOST_MONITORING_BOOTSTRAP_ADMIN_EMAIL=admin@example.com
HOST_MONITORING_BOOTSTRAP_ADMIN_PASSWORD=<initial admin password>
```

Then:

```bash
host-monitoring-server serve
```

The local console API uses `POST /api/v1/auth/login`, `POST /api/v1/auth/logout` and
`GET /api/v1/auth/session`. Agent pairing and reporting endpoints are authenticated with
their own agent tokens or one-time pairing secrets.

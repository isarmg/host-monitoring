# Host Monitoring Server

The Host Monitoring server is an independent control plane for the cross-platform
`host-m-agent`. It stores monitored hosts, telemetry, agent credentials and audit events
in its own SQLite database.

## Build

From the repository root:

```bash
cargo build --release -p host-monitoring-server
```

## Run

Environment variables use the `HOST_MONITORING_` prefix:

```text
HOST_MONITORING_DATABASE_URL=sqlite:///var/lib/isarmg/host-monitoring/db/app.db
HOST_MONITORING_BOOTSTRAP_ADMIN_EMAIL=admin@example.com
HOST_MONITORING_BOOTSTRAP_ADMIN_PASSWORD=<initial admin password>
HOST_MONITORING_SESSION_IDLE_TTL_SECONDS=1800
HOST_MONITORING_SESSION_ABSOLUTE_TTL_SECONDS=43200
```

Then:

```bash
host-monitoring-server serve
```

The local console API uses `POST /api/v1/auth/login`, `POST /api/v1/auth/logout` and
`GET /api/v1/auth/session`. Agent pairing and reporting endpoints are authenticated with
their own agent tokens or one-time pairing secrets.

Pairing admission uses the TCP peer address directly; forwarded-address headers are not trusted.
Source, device, request/invite and administrator-account buckets are independently bounded and
expire after inactivity. A single device may hold at most four live pending pairing requests.
Admission failures return HTTP 429 with `Retry-After`; replaying an identical pairing request is
idempotent and does not allocate another pending row.

Authenticated telemetry is limited per Host with a bounded 16,384-entry table. Inactive entries
expire after 15 minutes, and capacity pressure never evicts a depleted bucket to reset its rate.

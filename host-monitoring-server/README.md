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
HOST_MONITORING_TELEMETRY_QUEUE_CAPACITY=256
HOST_MONITORING_TELEMETRY_BATCH_SIZE=64
HOST_MONITORING_TELEMETRY_FLUSH_MILLISECONDS=25
HOST_MONITORING_TELEMETRY_ENQUEUE_WAIT_MILLISECONDS=10
HOST_MONITORING_TELEMETRY_REQUEST_TIMEOUT_MILLISECONDS=10000
HOST_MONITORING_TELEMETRY_SHUTDOWN_DRAIN_MILLISECONDS=15000
HOST_MONITORING_RAW_RETENTION_DAYS=7
HOST_MONITORING_AGGREGATE_RETENTION_DAYS=365
HOST_MONITORING_RETENTION_INTERVAL_SECONDS=300
HOST_MONITORING_RETENTION_BATCH_SIZE=256
HOST_MONITORING_RETENTION_MAX_TRANSACTIONS_PER_RUN=12
HOST_MONITORING_RETENTION_MAX_RUN_MILLISECONDS=2000
HOST_MONITORING_RETENTION_YIELD_MILLISECONDS=10
```

Then:

```bash
host-monitoring-server serve
```

`serve` acquires an exclusive instance lock plus a shared maintenance lock for the configured
SQLite file before opening it, and holds both until HTTP and background workers have stopped.
`doctor` takes the shared maintenance lock, while `migrate`, `admin-create` and
`admin-reset-password` take it exclusively and fail closed while the server is running. Locks are
per database, stored beside it, and opened on Linux through a trusted directory descriptor with
`openat2`; symbolic links, parent traversal, hard-linked files and special database/lock files are
rejected. Absolute and relative paths resolving to the same database share the same lock identity
across process working directories.

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

Validated telemetry is handed to one process-owned SQLite writer through a bounded queue. The
writer takes SQLite's write slot before reading, commits up to 64 reports in one transaction, and
uses a savepoint for each report so a revoked credential or conflicting `report_id` cannot roll
back or acknowledge its peers. A report receives `202 Accepted` only after the batch commit is
known to have completed. Queue admission waits at most 10 ms and the complete HTTP wait is capped
at 10 seconds; a full queue returns `429`, while a stopped writer, response deadline, or writer
failure returns `503`. These overload responses include `Retry-After: 1`. Once queued, work remains
owned by the writer even if the HTTP client disconnects, and normal shutdown stops admission and
drains for up to 15 seconds. `/health/ready` also becomes unavailable when the writer has stopped,
even if SQLite itself is still reachable.

Configuration is bounded even when overridden: queue capacity is at most 1,024 reports, batch
size at most 512 and no larger than the queue, flush latency at most 1 second, enqueue wait at most
250 ms, total request time at most 30 seconds, and shutdown drain at most 60 seconds.

Raw scalar telemetry is retained for 7 days by default. Older non-latest reports are folded into
per-Host UTC-hour rows containing the report count, observed interval and the non-NULL count,
minimum, maximum and average of every scalar metric. The aggregate transaction marks exactly the
raw rows it includes; only after that transaction commits does a separate bounded transaction
delete marked rows. A crash between those phases therefore cannot lose or double-count data, and
the report referenced by `monitored_hosts.latest_report_id` is never aggregated or deleted.
Hourly aggregates have their own 365-day retention window.

One serial maintenance task runs immediately after startup and then every five minutes. A run uses
at most twelve short `BEGIN IMMEDIATE` transactions, processes at most 256 rows per transaction, yields
between productive transactions and stops after 2 seconds. Individual failures are logged and
retried on a later tick without stopping the service. Shutdown cancels any in-progress run and
waits for the task. Runtime overrides remain bounded: raw retention is 1-365 days, aggregate
retention must be longer and is at most 3,650 days, batch size is at most 512, a run uses at most
30 transactions and 10 seconds, and the periodic interval is at most 24 hours.

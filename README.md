# Host Monitoring

Host Monitoring is an independent product containing:

- `host-monitoring-server`: local web control plane with administrator accounts and sessions.
- `host-protocol`: stable JSON wire types shared by the server and agent.
- `host-m-agent`: cross-platform read-only host telemetry agent.
- `web/`: small standalone management page compiled into the server.

The server and agent communicate over the project's own pairing and report endpoints. They do
not depend on a central runtime or a shared session service.
Validated reports enter a bounded queue and one batched SQLite writer, so concurrent agents do
not each compete independently for the database write lock.
Older scalar reports are compacted into idempotent per-Host UTC-hour aggregates before bounded
raw deletion. The latest report for every Host is retained, and aggregate rows have an independent
retention window so neither history table grows without limit.

## Build

```bash
cargo build --workspace --release
```

## Run an unbound development server

```text
HOST_MONITORING_DATABASE_URL=sqlite:///var/lib/isarmg/host-monitoring/db/app.db
HOST_MONITORING_BOOTSTRAP_ADMIN_EMAIL=admin@example.com
HOST_MONITORING_BOOTSTRAP_ADMIN_PASSWORD=<initial admin password>
```

```bash
host-monitoring-server serve
```

`serve` is deliberately limited to ordinary development binaries whose source identity is
`unbound`. An official source-bound server rejects it. Production has no mutable `current` link:
systemd executes the physical
`/opt/isarmg/host-monitoring/releases/0.7.0/bin/host-monitoring-server` with
`serve-release --root /opt/isarmg/host-monitoring/releases/0.7.0`, and the process verifies its
complete immutable tree before opening application state.

## Build the immutable 0.7 server release

From a completely clean checkout whose annotated `v0.7.0` tag dereferences to `HEAD`, publish to
an existing output directory outside the repository:

```bash
python3 scripts/package-server-release.py /absolute/output-directory
```

The builder binds the full lowercase source commit into the binary, runs `npm ci` and the Web
build, writes a strict whole-tree manifest, creates a deterministic archive and checksum without
overwriting either output, extracts and re-verifies the archive, then starts it from `/` and probes
both liveness and a compiled JavaScript asset. Release archives contain no migration, backup or
restore implementation.

Browser sessions and CSRF tokens are random, revocable SQLite records. Pairing admission applies
separate bounded budgets to the real TCP source, device, pairing request/invite and administrator
account; the service does not trust forwarded-address headers by default.

## Database schema lifecycle

The 0.7 product initializes only an absent database with its single current schema. It does not
contain migration, backup or restore commands. Existing databases must have the exact
`product_metadata` application, Cargo package version, schema revision and SHA-256 fingerprint, and
the fingerprint is independently recomputed from `sqlite_schema` before a write connection is
opened. A 0.6 database, a database without metadata or any schema drift is rejected read-only;
version upgrades, backup and restore belong to the independent upgrade tool.

The server owns an exclusive per-database instance lock and a shared maintenance lock from before
SQLite is opened until shutdown completes. `doctor` shares the maintenance lock; administrator
commands take it exclusively and fail immediately while the server is running. Database and
adjacent lock paths are opened on Linux through a trusted directory descriptor with `openat2`
symlink and traversal protection. Do not replace the database or its adjacent lock files with
symbolic links, hard links or special files.

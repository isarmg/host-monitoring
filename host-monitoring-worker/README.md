# Union host-monitoring worker

This is the process-isolated implementation of Union's existing Agent pairing, telemetry and
console-query contract. It is a private Union module, not a standalone product or public service.
The crate is `publish = false`; Builder packages it independently when the Union release profile
includes the module. Its business code is not linked into Core or Web Shell.

The source package contract is described by `manifest.json`, `permissions.json`,
`config/schema.json`, `version.json`, `frontend/` and the module-owned `migrations/`.
The checked-in `frontend/` assets are deterministically generated from the repository-level
`module-web/` React/TypeScript project. It restores the original Union host cards, Agent invite
flow, editable remarks, hardware detail tabs and metric history while continuing to use the
dynamic module API; React is supplied by Web Shell and is not bundled a second time. Builder
decides whether the package is included in an immutable Union release; Union Runtime decides
whether that already-included private process is enabled. Runtime installation or downloading
new business code is outside this contract.

## Runtime boundary

- Default and only accepted bind class: loopback (`127.0.0.1:18105` by default).
- Storage: a module-owned PostgreSQL database and `host_monitoring` schema with owned migrations;
  no Core database, another module's database, Union SQLite or `AppState` access.
- Public ingress: Union's Manifest-driven gateway is the sole public listener. The worker rejects every
  route, including health probes, unless all four `gateway-v1` headers match exactly:
  `X-Union-Module-Protocol`, `X-Union-Module-Audience`, `X-Union-Module-Token` and
  `X-Forwarded-Prefix`.
- The fixed audience is `host-monitoring` and the fixed prefix is `/api/modules/host-monitoring`.
  The per-process token is 64 lowercase hexadecimal characters supplied by Union's supervisor.
- Agent report, pairing create/read/status and capability activation retain their module-owned
  Bearer/Pairing or one-time-code checks. Union adds its separate per-process gateway proof, so
  deployed Agents never receive the worker credential.
- Browser activation lives at `/modules/host-monitoring/activate/:requestId`. It submits to the
  separate `/host-m-agent/v1/activate-admin` platform route protected by Core login,
  `host-monitoring.agents.write` and CSRF, while the worker still verifies and consumes the same
  kind of one-time activation code. Agent/Tray activation continues to use `/host-m-agent/v1/activate`
  without requiring a browser session.
- Console cookies must be removed by Union. The worker rejects requests containing `Cookie`,
  requires one canonical `X-Union-Principal`, and records that real operator as the audit actor.
- `/health/live` is process liveness; `/health/ready` additionally probes PostgreSQL. Both echo
  `X-Union-Module-Protocol: gateway-v1` and `X-Union-Module-Audience: host-monitoring`.

Union must remove any inbound copies of all four internal headers before writing its own values.
The token is shared only by Union and this worker and must be regenerated for each worker process.

## Offline/admin command

```console
union-host-monitoring-worker migrate \
  --database-url postgresql://host_monitoring@127.0.0.1/host_monitoring
```

`serve` is intentionally a Core-only runtime command. It requires Manifest v2 standard identity,
`UNION_PLUGIN_BIND`, `UNION_PLUGIN_CONFIG` and gateway variables, reads the schema-validated JSON
configuration file directly, and refuses non-loopback binds or non-PostgreSQL URLs. There is no
module-specific environment alias, SQLite importer, upgrade converter or rollback-to-old-schema path.

## Union integration and repository boundary

This crate is a member of the standalone `host-monitoring` source workspace; it is not a member of
the Union Core repository. The sibling `../protocol` crate is the stable wire contract shared with
the remotely deployed Agent in `../host-m-agent`; both consume it through the same workspace path, making
this repository the authoritative source for the complete Host Monitoring domain.

Union Builder assembles this module through its Manifest-defined package. Union Core owns the
public routes, generates the process credential, removes untrusted internal headers/cookies and
supervises this binary on its Manifest-reserved loopback endpoint. The v0.6 boundary is fresh-only:
the former in-process database, old Agent state and previous module schema are not accepted or migrated.

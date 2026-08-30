# Host Monitoring Server 0.7 release

This archive contains one immutable Linux x86_64 server release. Extract its `0.7.0/` directory
directly under `/opt/isarmg/host-monitoring/releases/`; never merge it with another release tree
and never introduce a mutable `current` path.

```bash
tar -xzf host-monitoring-server-0.7.0-x86_64-unknown-linux-gnu.tar.gz \
  -C /opt/isarmg/host-monitoring/releases
```

Before activation, run the verifier contained in the physical version directory:

```bash
/opt/isarmg/host-monitoring/releases/0.7.0/bin/host-monitoring-server \
  verify-release --root /opt/isarmg/host-monitoring/releases/0.7.0
```

Install the included systemd unit and configure `/etc/isarmg/host-monitoring.env`. Its executable,
root and static asset paths are fixed to `releases/0.7.0`. The same source-bound Rust binary
verifies the complete tree and confirms `HOST_MONITORING_STATIC_DIR` is that tree's `web/`
directory before it opens state or starts serving.

This release contains no migration, backup or restore path. The independent `isarmg-upgrade`
repository owns state backup, version transformation, recovery verification and activation.

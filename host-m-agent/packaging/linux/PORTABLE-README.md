# host-m-agent Linux portable bundle

The Linux `.tar.gz` artifact is a **portable binary bundle**, not a managed
installer. Extracting it does not create the `host-m-agent` service account,
install the hardened systemd unit, establish filesystem permissions, preserve
configuration across reinstalls, or provide package-manager uninstall/purge
semantics.

For a managed installation, use the DEB or RPM built from
`host-m-agent/packaging/nfpm.yaml`. Those packages provide:

- a dedicated non-login account and private state directory;
- a hardened, enabled systemd service;
- exact-current configuration validation and package-manager `config|noreplace` handling;
- ordinary uninstall that leaves identity and spool in place without backing up or restoring them;
- explicit local purge through `apt purge host-m-agent` (DEB) or
  `sudo host-m-agent-purge --yes` before `dnf remove host-m-agent` (RPM).

The product package does not perform backup, restore, or cross-version migration. Use the
independent upgrade repository before removal when the installation must be recovered or upgraded.

If you deliberately use the portable binary, you own its service definition,
configuration and state paths, permissions, replacement, and removal. Never clone
an already-paired state directory to another machine. Removing local files does
not revoke the server-side instance; revoke it in the Host Monitoring Web console first.

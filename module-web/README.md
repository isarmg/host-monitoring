# Host Monitoring Web Module

This directory owns the Host Monitoring dynamic frontend. It ports the final pre-split Union
experience into the module boundary:

- the Shell “创建 host-m-agent” action and one-time credential lifecycle;
- editable host cards and permanent deletion;
- adjacent overview, network, storage, GPU, temperature, capability and history tabs;
- the authenticated browser activation page.

`src/entry.ts` remains a small Plugin API adapter. It binds Union Web Shell's single React
runtime and the Manifest-scoped `/api/modules/host-monitoring` client before lazily evaluating
React Query, Lucide and the page components. This preserves hook/context identity without
coupling the module source to Core or bundling another React/ReactDOM copy.

`npm run build` type-checks the source and writes deterministic artifacts to ignored `dist/`
and the committed `../host-monitoring-worker/frontend/` package directory. CI rebuilds the
artifacts and rejects drift.

Use:

```console
npm ci
npm test
```

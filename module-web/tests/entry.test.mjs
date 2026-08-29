import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import entry, {
  activationCodeForSubmission,
  agentActivationApi,
  canActivatePairing,
  historyValues,
  latestHistoryValue,
  monitoringApi,
  pendingAgentInstances,
} from "../dist/entry.js";

test("compiled module exposes the Manifest components and permission-aware action", async () => {
  const activation = await entry.activate({
    react: React,
    api: { basePath: "/api/modules/host-monitoring", request: async () => ({}) },
  });

  assert.equal(entry.moduleId, "host-monitoring");
  assert.deepEqual(Object.keys(activation.components), ["HostMonitoringView", "HostActivationView"]);
  assert.deepEqual(activation.primaryActions, [{
    component: "HostMonitoringView",
    label: "创建 host-m-agent",
    permission: "host-monitoring.agents.write",
  }]);
  const markup = renderToStaticMarkup(React.createElement(activation.components.HostMonitoringView, {
    location: { params: {} },
    actionRequest: 0,
    onActionRequestHandled: () => undefined,
    hasPermission: () => true,
  }));
  assert.match(markup, /主机监控/);
});

test("activation and monitoring helpers retain the original behavior", () => {
  assert.equal(activationCodeForSubmission("  one-time-code\n"), "one-time-code");
  assert.equal(canActivatePairing("waiting"), true);
  assert.equal(canActivatePairing("active"), false);
  assert.deepEqual(pendingAgentInstances([
    { request_id: "a", instance_id: "", display_name: "A", status: "pending", expires_at: "", created_at: "" },
    { request_id: "b", instance_id: "b", display_name: "B", status: "active", expires_at: "", created_at: "" },
  ]).map((item) => item.request_id), ["a"]);
  const values = historyValues([
    { cpu_usage_percent: 25 },
    { cpu_usage_percent: null },
    { cpu_usage_percent: 75 },
  ], (point) => point.cpu_usage_percent);
  assert.deepEqual(values, [25, null, 75]);
  assert.equal(latestHistoryValue(values), 75);
});

test("console mutations use only the module-scoped gateway paths", async () => {
  const calls = [];
  await entry.activate({
    react: React,
    api: {
      basePath: "/api/modules/host-monitoring",
      request: async (path, init) => {
        calls.push([path, init]);
        return path === "/agent/v2/activate-admin"
          ? { instance_id: "host-one", status: "active" }
          : undefined;
      },
    },
  });
  await monitoringApi.monitoringUpdateRemark("host/one", "Build host");
  await monitoringApi.monitoringCancelAgentInstance("request/one");
  await agentActivationApi.activateAgent("request-one", "secret");
  assert.deepEqual(calls.map(([path, init]) => [path, init.method]), [
    ["/managed-instances/host%2Fone", "PATCH"],
    ["/agent-instances/request%2Fone", "DELETE"],
    ["/agent/v2/activate-admin", "POST"],
  ]);
});

test("compiled output delegates React instead of embedding another React runtime", async () => {
  const files = await readdir(new URL("../dist/chunks/", import.meta.url));
  const javascript = ["entry.js", ...files.filter((file) => file.endsWith(".js"))
    .map((file) => path.join("chunks", file))];
  const source = (await Promise.all(javascript.map((file) =>
    readFile(new URL(`../dist/${file}`, import.meta.url), "utf8")))).join("\n");
  assert.doesNotMatch(source, /react\.production\.js|Invalid hook call|createRoot\(/);
});

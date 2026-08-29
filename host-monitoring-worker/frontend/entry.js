import {
  activationCodeForSubmission,
  agentActivationApi,
  bindModuleApi,
  bindReact,
  canActivatePairing,
  historyValues,
  latestHistoryValue,
  monitoringApi,
  pendingAgentInstances
} from "./chunks/chunk-3IENDW2S.js";

// src/entry.ts
var entry = {
  pluginApiVersion: "1.0.0",
  moduleId: "host-monitoring",
  version: "0.6.0",
  async activate(host) {
    bindReact(host.react);
    bindModuleApi(host.api);
    const module = await import("./chunks/app-KVGSCKNB.js");
    return module.activate();
  }
};
var entry_default = entry;
export {
  activationCodeForSubmission,
  agentActivationApi,
  canActivatePairing,
  entry_default as default,
  historyValues,
  latestHistoryValue,
  monitoringApi,
  pendingAgentInstances
};

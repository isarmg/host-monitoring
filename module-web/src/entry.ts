import type * as ReactRuntime from "react";
import { bindModuleApi, type ModuleApi } from "./platform";
import { bindReact } from "./runtime";

export {
  activationCodeForSubmission,
  canActivatePairing,
} from "./features/agent-activation/route";
export {
  historyValues,
  latestHistoryValue,
  pendingAgentInstances,
} from "./features/monitoring/model";
export { monitoringApi } from "./features/monitoring/api";
export { agentActivationApi } from "./features/agent-activation/api";

interface HostSdk {
  react: typeof ReactRuntime;
  api: ModuleApi;
}

const entry = {
  pluginApiVersion: "1.0.0",
  moduleId: "host-monitoring",
  version: "0.5.0",
  async activate(host: HostSdk) {
    bindReact(host.react);
    bindModuleApi(host.api);
    const module = await import("./app");
    return module.activate();
  },
};

export default entry;

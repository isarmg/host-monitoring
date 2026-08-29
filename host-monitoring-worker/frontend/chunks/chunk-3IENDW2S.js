// src/platform.ts
var activeApi = null;
function bindModuleApi(api) {
  if (activeApi && activeApi.basePath !== api.basePath) {
    throw new Error("\u6A21\u5757 API \u4E0D\u80FD\u8DE8\u8D8A Manifest \u547D\u540D\u7A7A\u95F4\u91CD\u65B0\u7ED1\u5B9A");
  }
  activeApi = api;
}
function request(path, init) {
  if (!activeApi) return Promise.reject(new Error("\u6A21\u5757\u5C1A\u672A\u7531 Union Web Shell \u6FC0\u6D3B"));
  return activeApi.request(path, init);
}
function pathSegment(value) {
  return encodeURIComponent(String(value));
}

// src/runtime.ts
var injected = null;
function bindReact(runtime) {
  if (injected && injected !== runtime) {
    throw new Error("\u6A21\u5757 React Runtime \u4E0D\u80FD\u5728\u6FC0\u6D3B\u540E\u66FF\u6362");
  }
  injected = runtime;
}
function react() {
  if (!injected) throw new Error("\u6A21\u5757\u5C1A\u672A\u7531 Union Web Shell \u6FC0\u6D3B");
  return injected;
}
var Fragment = Symbol.for("react.fragment");
var createElement = ((...args) => react().createElement(...args));
var createContext = ((...args) => react().createContext(...args));
var forwardRef = ((...args) => react().forwardRef(...args));
var useCallback = ((...args) => react().useCallback(...args));
var useContext = ((...args) => react().useContext(...args));
var useEffect = ((...args) => react().useEffect(...args));
var useId = ((...args) => react().useId(...args));
var useLayoutEffect = ((...args) => react().useLayoutEffect(...args));
var useMemo = ((...args) => react().useMemo(...args));
var useRef = ((...args) => react().useRef(...args));
var useState = ((...args) => react().useState(...args));
var useSyncExternalStore = ((...args) => react().useSyncExternalStore(...args));

// src/features/agent-activation/route.ts
function activationCodeForSubmission(value) {
  return value.trim();
}
function canActivatePairing(status) {
  return status === "waiting";
}

// src/features/monitoring/model.ts
var NA = "N/A";
function isNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}
function formatMetric(value, formatter) {
  return isNumber(value) ? formatter(value) : NA;
}
function formatPercent(value) {
  return formatMetric(value, (metric) => `${metric.toFixed(1)}%`);
}
function formatTemperature(value) {
  return formatMetric(value, (metric) => `${metric.toFixed(1)} \xB0C`);
}
function sumNullable(...values) {
  const available = values.filter(isNumber);
  return available.length ? available.reduce((total, value) => total + value, 0) : null;
}
function metricTone(value, threshold = 85) {
  if (!isNumber(value)) return "neutral";
  return value >= threshold ? "warn" : "good";
}
function statusMeta(status) {
  if (status === "online") return { label: "\u5728\u7EBF", tone: "good" };
  if (status === "stale") return { label: "\u6570\u636E\u8FC7\u671F", tone: "warn" };
  return { label: "\u79BB\u7EBF", tone: "danger" };
}
function historyValues(points, read) {
  return points.map((point) => {
    const value = read(point);
    return isNumber(value) ? value : null;
  });
}
function latestHistoryValue(values) {
  return values.length ? values[values.length - 1] : null;
}
function pendingAgentInstances(instances) {
  return instances.filter((instance) => instance.status === "pending");
}
var agentAuthorizationKeyGuidance = "\u6388\u6743\u5BC6\u94A5\u53EA\u5728\u672C\u6B21\u521B\u5EFA\u540E\u663E\u793A\u3002Windows \u8BF7\u5728 host-m-agent \u6258\u76D8\u7684\u201C\u672C\u5730\u914D\u7F6E\u201D\u9875\u586B\u5199\u670D\u52A1\u5668\u5730\u5740\u548C\u6B64\u5BC6\u94A5\uFF1BCLI \u914D\u5BF9\u8BF7\u5728 host-m-agent \u6253\u5F00\u7684\u6FC0\u6D3B\u9875\u786E\u8BA4\u3002";

// src/features/monitoring/api.ts
var monitoringHostPath = (id) => `/hosts/${pathSegment(id)}`;
var monitoringManagedInstancePath = (id) => `/managed-instances/${pathSegment(id)}`;
var monitoringAgentInstancePath = (requestId) => `/agent-instances/${pathSegment(requestId)}`;
var monitoringApi = {
  monitoringHosts: (limit = 20, offset = 0) => request(
    `/hosts?limit=${pathSegment(limit)}&offset=${pathSegment(offset)}`
  ),
  monitoringHost: (id) => request(monitoringHostPath(id)),
  monitoringHistory: (id) => request(`${monitoringHostPath(id)}/history`),
  monitoringUpdateRemark: (id, remark) => request(
    monitoringManagedInstancePath(id),
    {
      method: "PATCH",
      body: JSON.stringify({ remark }),
      expectedStatus: 204
    }
  ),
  /** 永久删除主机、历史数据、凭据和关联邀请。 */
  monitoringDeleteHost: (id) => request(
    monitoringManagedInstancePath(id),
    { method: "DELETE", expectedStatus: 204 }
  ),
  monitoringAgentInstances: (signal) => request(
    "/agent-instances",
    { signal }
  ),
  monitoringCreateAgentInstance: (display_name, expires_in_minutes) => request("/agent-instances", {
    method: "POST",
    body: JSON.stringify({ display_name, expires_in_minutes }),
    expectedStatus: 201
  }),
  monitoringCancelAgentInstance: (requestId) => request(
    monitoringAgentInstancePath(requestId),
    { method: "DELETE", expectedStatus: 204 }
  )
};

// src/features/agent-activation/api.ts
var agentActivationApi = {
  activateAgent: async (request_id, activation_code) => {
    try {
      return await request("/host-m-agent/v1/activate-admin", {
        method: "POST",
        body: JSON.stringify({ request_id, activation_code }),
        suppressAuthExpired: true
      });
    } catch (error) {
      if (error && typeof error === "object" && "status" in error && error.status === 401) {
        throw new Error("\u6FC0\u6D3B\u7801\u65E0\u6548\u6216\u5DF2\u8FC7\u671F");
      }
      throw error;
    }
  },
  agentPairingRequest: (requestId) => request(
    `/host-m-agent/v1/pairing-requests/${pathSegment(requestId)}`,
    { suppressAuthExpired: true }
  )
};

export {
  bindModuleApi,
  bindReact,
  Fragment,
  createElement,
  createContext,
  forwardRef,
  useCallback,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  activationCodeForSubmission,
  canActivatePairing,
  NA,
  isNumber,
  formatMetric,
  formatPercent,
  formatTemperature,
  sumNullable,
  metricTone,
  statusMeta,
  historyValues,
  latestHistoryValue,
  pendingAgentInstances,
  agentAuthorizationKeyGuidance,
  monitoringApi,
  agentActivationApi
};

import { pathSegment, request } from "../../platform";
import type {
  AgentInstanceSummary,
  CreatedAgentInstance,
  MonitoringHistoryResponse,
  MonitoringHostDetailResponse,
  MonitoringHostsResponse,
} from "./types";

const monitoringHostPath = (id: string) => `/hosts/${pathSegment(id)}`;
const monitoringManagedInstancePath = (id: string) =>
  `/managed-instances/${pathSegment(id)}`;
const monitoringAgentInstancePath = (requestId: string) =>
  `/agent-instances/${pathSegment(requestId)}`;

export const monitoringApi = {
  monitoringHosts: (limit = 20, offset = 0) => request<MonitoringHostsResponse>(
    `/hosts?limit=${pathSegment(limit)}&offset=${pathSegment(offset)}`,
  ),
  monitoringHost: (id: string) => request<MonitoringHostDetailResponse>(monitoringHostPath(id)),
  monitoringHistory: (id: string) => request<MonitoringHistoryResponse>(`${monitoringHostPath(id)}/history`),
  monitoringUpdateRemark: (id: string, remark: string) => request<void>(
    monitoringManagedInstancePath(id),
    {
      method: "PATCH",
      body: JSON.stringify({ remark }),
      expectedStatus: 204,
    },
  ),
  /** 永久删除主机、历史数据、凭据和关联邀请。 */
  monitoringDeleteHost: (id: string) => request<void>(
    monitoringManagedInstancePath(id),
    { method: "DELETE", expectedStatus: 204 },
  ),
  monitoringAgentInstances: (signal?: AbortSignal) => request<AgentInstanceSummary[]>(
    "/agent-instances",
    { signal },
  ),
  monitoringCreateAgentInstance: (display_name: string, expires_in_minutes: number) =>
    request<CreatedAgentInstance>("/agent-instances", {
      method: "POST",
      body: JSON.stringify({ display_name, expires_in_minutes }),
      expectedStatus: 201,
    }),
  monitoringCancelAgentInstance: (requestId: string) => request<void>(
    monitoringAgentInstancePath(requestId),
    { method: "DELETE", expectedStatus: 204 },
  ),
};

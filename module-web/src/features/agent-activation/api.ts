import { pathSegment, request } from "../../platform";
import type { AgentActivationResponse, AgentPairingRequestSummary } from "./types";

export const agentActivationApi = {
  activateAgent: async (request_id: string, activation_code: string) => {
    try {
      return await request<AgentActivationResponse>("/host-m-agent/v1/activate-admin", {
        method: "POST",
        body: JSON.stringify({ request_id, activation_code }),
        suppressAuthExpired: true,
      });
    } catch (error) {
      if (error && typeof error === "object" && "status" in error && error.status === 401) {
        throw new Error("激活码无效或已过期");
      }
      throw error;
    }
  },
  agentPairingRequest: (requestId: string) => request<AgentPairingRequestSummary>(
    `/host-m-agent/v1/pairing-requests/${pathSegment(requestId)}`,
    { suppressAuthExpired: true },
  ),
};

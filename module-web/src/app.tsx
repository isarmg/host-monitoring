import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AgentActivationPage } from "./features/agent-activation/AgentActivationPage";
import { MonitoringView } from "./features/monitoring/MonitoringView";
import { Fragment, createElement as h } from "./runtime";

interface ComponentProps {
  location: { params: Readonly<Record<string, string>> };
  actionRequest: number;
  onActionRequestHandled: (request: number) => void;
  hasPermission: (permission: string) => boolean;
}

export function activate() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { refetchOnWindowFocus: false, retry: 1, staleTime: 5_000 },
      mutations: { retry: false },
    },
  });

  function HostMonitoringView(props: ComponentProps) {
    return (
      <QueryClientProvider client={queryClient}>
        <MonitoringView
          addTrigger={props.actionRequest}
          onAddTriggerHandled={props.onActionRequestHandled}
          canManageAgents={props.hasPermission("host-monitoring.agents.write")}
        />
      </QueryClientProvider>
    );
  }

  function HostActivationView(props: ComponentProps) {
    return (
      <QueryClientProvider client={queryClient}>
        <AgentActivationPage requestId={props.location.params.requestId ?? null} />
      </QueryClientProvider>
    );
  }

  return {
    components: { HostMonitoringView, HostActivationView },
    primaryActions: [{
      component: "HostMonitoringView",
      label: "创建 host-m-agent",
      permission: "host-monitoring.agents.write",
    }],
  };
}

import { createSarmgAdminApplication, errorRequestId, useAdminApplication } from "../shell/index.js";
import { Button, EmptyState, ErrorState, LoadingState } from "@sarmg/admin-ui";
import { useEffect, useState } from "react";
import { CURRENT_API_PREFIX, administratorApi, isHostListResponse, type HostListResponse } from "./api";
import { Instances } from "./Instances";
import { HostDetails } from "./HostDetails";
import { HostsTable } from "./HostsTable";
import { HeaderNavigation, InstanceHeaderActions } from "../shell/index.js";

function HostsPage() {
  const { client } = useAdminApplication();
  const [response, setResponse] = useState<HostListResponse | null>(null);
  const [failure, setFailure] = useState<{ requestId?: string } | null>(null);
  const [generation, setGeneration] = useState(0);
  const [offset, setOffset] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [createSignal, setCreateSignal] = useState(0);
  const [page, setPage] = useState(() => window.location.hash === "#monitor" ? "monitor" : "instances");
  useEffect(() => {
    const changed = () => setPage(window.location.hash === "#monitor" ? "monitor" : "instances");
    window.addEventListener("hashchange", changed); return () => window.removeEventListener("hashchange", changed);
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    setResponse(null); setFailure(null);
    void client.request(`${CURRENT_API_PREFIX}/monitoring/hosts?limit=50&offset=${offset}`, isHostListResponse, { signal: controller.signal })
      .then(value => { if (!controller.signal.aborted) setResponse(value); })
      .catch(error => { if (!controller.signal.aborted) setFailure({ requestId: errorRequestId(error) }); });
    return () => controller.abort();
  }, [client, offset, generation]);
  const refresh = () => setGeneration(value => value + 1);
  const host = response?.hosts.find(item => item.id === selected) ?? response?.hosts[0];
  return <section id="hosts"><InstanceHeaderActions create={() => { window.location.hash = "instances"; setCreateSignal(value => value + 1); }} refresh={refresh} refreshing={response === null && failure === null} /><HeaderNavigation label="监控页面">{[["instances","实例"],["monitor","实时监控"]].map(([id,name]) => <Button key={id} aria-pressed={page === id} onClick={() => { window.location.hash = id; }}>{name}</Button>)}</HeaderNavigation><h1 className="sarmg-visually-hidden">主机监控</h1>
      {failure && <ErrorState requestId={failure.requestId} onRetry={refresh}>无法加载主机列表</ErrorState>}
      <div hidden={page !== "instances"}>
      <Instances openCreateSignal={createSignal} refreshSignal={generation} hostsChanged={refresh} />
      <section aria-label="监控实例"><h2>已配对主机</h2>{response === null ? failure ? <EmptyState>请重试加载实例列表</EmptyState> : <LoadingState>正在加载主机…</LoadingState> : <HostsTable hosts={response.hosts} select={id => { setSelected(id); window.location.hash = "monitor"; }} />}</section>
      {response && <nav className="sarmg-instance-toolbar" aria-label="主机分页"><Button disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - 50))}>上一页</Button>
        <span>共 {response.total} 台</span><Button disabled={response.offset + response.hosts.length >= response.total} onClick={() => setOffset(offset + 50)}>下一页</Button>
      </nav>}
      </div>
      {page === "monitor" && <section aria-label="实时监控内容">
      {response === null ? failure ? <EmptyState>请重试加载实例列表</EmptyState> : <LoadingState>正在加载主机…</LoadingState>
        : host ? <HostDetails key={host.id} host={host} changed={refresh} /> : <EmptyState>暂无主机，请点击“新建实例”并完成配对。</EmptyState>}
      </section>}
  </section>;
}

export default createSarmgAdminApplication({
  product: { name: "Host Monitoring" },
  client: administratorApi,
  navigation: [],
  routes: <HostsPage />,
});

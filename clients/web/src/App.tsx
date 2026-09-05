import { createSarmgAdminApplication, errorRequestId, useAdminApplication } from "@sarmg/admin-shell";
import { Button, EmptyState, ErrorState, LoadingState, StatusBadge, Table } from "@sarmg/admin-ui";
import { useEffect, useState } from "react";
import { CURRENT_API_PREFIX, administratorApi, isHostListResponse, type HostListResponse } from "./api";

function HostsPage() {
  const { client } = useAdminApplication();
  const [response, setResponse] = useState<HostListResponse | null>(null);
  const [failure, setFailure] = useState<{ requestId?: string } | null>(null);
  const [generation, setGeneration] = useState(0);
  const [offset, setOffset] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setResponse(null); setFailure(null);
    void client.request(`${CURRENT_API_PREFIX}/monitoring/hosts?limit=50&offset=${offset}`, isHostListResponse, { signal: controller.signal })
      .then(value => { if (!controller.signal.aborted) setResponse(value); })
      .catch(error => { if (!controller.signal.aborted) setFailure({ requestId: errorRequestId(error) }); });
    return () => controller.abort();
  }, [client, offset, generation]);
  const refresh = () => setGeneration(value => value + 1);
  return <section id="hosts"><h1>主机监控</h1>
    <Button onClick={refresh} disabled={response === null && failure === null}>刷新</Button>
    {failure ? <ErrorState requestId={failure.requestId} onRetry={refresh}>无法加载主机列表</ErrorState>
      : response === null ? <LoadingState>正在加载主机…</LoadingState>
      : <>
        {response.hosts.length === 0 ? <EmptyState>暂无主机</EmptyState>
          : <Table aria-label="受监控主机"><caption>主机状态与采集数据</caption>
            <thead><tr><th scope="col">名称</th><th scope="col">状态</th><th scope="col">CPU</th><th scope="col">内存</th><th scope="col">详情</th></tr></thead>
            <tbody>{response.hosts.map(host => <tr key={host.id}><th scope="row">{host.name}</th>
              <td><StatusBadge status={host.status} /></td>
              <td>{host.cpu_usage_percent === null ? "不可用" : `${host.cpu_usage_percent.toFixed(1)}%`}</td>
              <td>{host.memory_usage_percent === null ? "不可用" : `${host.memory_usage_percent.toFixed(1)}%`}</td>
              <td><details><summary>完整采集信息</summary><dl>{Object.entries(host).map(([key, value]) =>
                <div key={key}><dt>{key}</dt><dd>{key === "capabilities"
                  ? host.capabilities.map(capability => <p key={capability.name}>{capability.name}: {capability.available ? "可用" : "不可用"} · {capability.source} {capability.error_kind} {capability.message}</p>)
                  : value === null ? "不可用" : String(value)}</dd></div>
              )}</dl></details></td></tr>)}</tbody>
          </Table>}
        <nav aria-label="主机分页"><Button disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - 50))}>上一页</Button>
          <span>共 {response.total} 台</span>
          <Button disabled={response.offset + response.hosts.length >= response.total} onClick={() => setOffset(offset + 50)}>下一页</Button>
        </nav>
      </>}
  </section>;
}

export default createSarmgAdminApplication({
  product: { name: "Host Monitoring", version: "0.8.0" },
  client: administratorApi,
  navigation: [{ label: "主机", href: "#hosts" }],
  routes: <HostsPage />,
});

import { Button, EmptyState, Table } from "@sarmg/admin-ui";
import type { Host } from "./api";

function percent(value: number | null) { return value === null ? "未上报" : `${value.toFixed(1)}%`; }
function timestamp(value: string) {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleString() : "未知";
}
export function HostsTable({ hosts, select }: { hosts: Host[]; select(id: string): void }) {
  if (!hosts.length) return <EmptyState>暂无已配对主机，请新建实例并完成配对。</EmptyState>;
  return <Table aria-label="监控实例列表"><thead><tr>
    <th scope="col">实例名称</th><th scope="col">状态</th><th scope="col">系统 / 架构</th>
    <th scope="col">CPU 使用率</th><th scope="col">内存使用率</th><th scope="col">最近连接</th><th scope="col">最近上报</th>
  </tr></thead><tbody>{hosts.map(host => <tr key={host.id}>
    <th scope="row"><Button aria-label={`选择实例 ${host.name}`} onClick={() => select(host.id)}>{host.name}</Button></th>
    <td>{host.status === "online" ? "在线" : host.status === "offline" ? "离线" : host.status}</td>
    <td>{host.os} / {host.arch}</td><td>{percent(host.cpu_usage_percent)}</td><td>{percent(host.memory_usage_percent)}</td>
    <td>{timestamp(host.last_seen_at)}</td><td>{host.latest_collected_at ? timestamp(host.latest_collected_at) : "尚未上报"}</td>
  </tr>)}</tbody></Table>;
}

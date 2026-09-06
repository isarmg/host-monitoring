import { InstanceNameField } from "../shell/index.js";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Button, ConfirmDangerDialog, ErrorState, FormField, TextField } from "@sarmg/admin-ui";
import { errorRequestId, useAdminApplication } from "../shell/index.js";
import { isNoContent, type Host } from "./api";

export function HostDetails({ host, changed }: { host: Host; changed(): void }) {
  const { client, notify } = useAdminApplication();
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<{ requestId?: string } | null>(null);
  const [deleting, setDeleting] = useState(false);
  const active = useRef<AbortController | null>(null);
  useEffect(() => () => active.current?.abort(), []);
  async function mutate(method: "PATCH" | "DELETE", body?: string) {
    if (active.current) return;
    const controller = new AbortController(); active.current = controller; setPending(true); setFailure(null);
    try {
      await client.request(`/api/v2/monitoring/managed-instances/${host.id}`, isNoContent, { method, body, signal: controller.signal });
      if (!controller.signal.aborted) { setDeleting(false); notify(method === "PATCH" ? "实例名称已保存" : "实例已移除"); changed(); }
    } catch (error) { if (!controller.signal.aborted) setFailure({ requestId: errorRequestId(error) }); }
    finally { if (!controller.signal.aborted) { active.current = null; setPending(false); } }
  }
  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const data = new FormData(event.currentTarget);
    void mutate("PATCH", JSON.stringify({ remark: String(data.get("remark")).trim() }));
  }
  return <div className="sarmg-instance-detail">
    <section className="sarmg-content-panel"><h2>{host.name}</h2><dl>
      <dt>状态</dt><dd>{host.status}</dd><dt>系统</dt><dd>{host.os} / {host.arch}</dd>
      <dt>CPU</dt><dd>{host.cpu_usage_percent === null ? "不可用" : `${host.cpu_usage_percent.toFixed(1)}%`}</dd>
      <dt>内存</dt><dd>{host.memory_usage_percent === null ? "不可用" : `${host.memory_usage_percent.toFixed(1)}%`}</dd>
      <dt>最近上报</dt><dd>{host.latest_collected_at ?? "尚未上报"}</dd>
    </dl><details><summary>完整采集信息</summary><dl>{Object.entries(host).filter(([key]) => !key.endsWith("_version")).map(([key, value]) => <div key={key}>
      <dt>{key}</dt><dd>{key === "capabilities" ? host.capabilities.map(capability => <p key={capability.name}>{capability.name}: {capability.available ? "可用" : "不可用"} · {capability.source} {capability.error_kind} {capability.message}</p>) : value === null ? "不可用" : String(value)}</dd>
    </div>)}</dl></details></section>
    <section className="sarmg-content-panel" aria-label="实例设置"><h2>实例设置</h2>
      {failure && !deleting && <ErrorState requestId={failure.requestId}>保存未能确认，请刷新核对实例后再决定是否重试。</ErrorState>}
      <form onSubmit={save} aria-busy={pending}>
        <FormField label="实例名称"><InstanceNameField name="remark" defaultValue={host.name} required title="实例名称最多 32 个字符" readOnly={pending} /></FormField>
        <p>实例名称最多 32 个字符。</p>
        <p>采集周期等 Agent 本地设置由客户端管理，此处不修改客户端配置。</p>
        <div className="sarmg-actions"><Button disabled={pending} onClick={() => setDeleting(true)}>删除实例</Button><Button type="submit" disabled={pending}>{pending ? "正在处理…" : "保存设置"}</Button></div>
      </form>
    </section>
    {deleting && <ConfirmDangerDialog title="删除监控实例" description={`移除 ${host.name} 的监控数据和绑定凭据。该 Agent 需要重新配对才能再次接入。`}
      pending={pending} onClose={() => { if (!active.current) { setDeleting(false); setFailure(null); } }} onConfirm={() => void mutate("DELETE")}>
      {failure && <ErrorState requestId={failure.requestId}>删除未能确认，请刷新核对实例状态。</ErrorState>}
    </ConfirmDangerDialog>}
  </div>;
}

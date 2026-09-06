import { InstanceNameField } from "../shell/index.js";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Button, Dialog, ErrorState, FormField, TextField, Table, EmptyState, LoadingState, ConfirmDangerDialog } from "@sarmg/admin-ui";
import { errorRequestId, useAdminApplication } from "../shell/index.js";
import { isActivation, isCreatedInstance, isInstances, isNoContent, isPairingSummary, isUuid,
  type AgentInstance, type CreatedInstance, type PairingSummary } from "./api";

const instancesPath = "/api/v2/monitoring/agent-instances";
const labels = { pending: "待配对", active: "已配对", cancelled: "已取消" };
type Failure = { requestId?: string };

// Business request lifetime only; authentication and CSRF stay in Foundation.
function useAction() {
  const ref = useRef<AbortController | null>(null);
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<Failure | null>(null);
  useEffect(() => () => ref.current?.abort(), []);
  async function run(work: (signal: AbortSignal) => Promise<void>) {
    if (ref.current) return;
    const controller = new AbortController(); ref.current = controller;
    setPending(true); setFailure(null);
    try { await work(controller.signal); }
    catch (error) { if (!controller.signal.aborted) setFailure({ requestId: errorRequestId(error) }); }
    finally { if (!controller.signal.aborted) { ref.current = null; setPending(false); } }
  }
  return { pending, failure, run, idle: () => ref.current === null };
}

export function Instances({ hostsChanged, openCreateSignal = 0, refreshSignal = 0 }: { hostsChanged(): void; openCreateSignal?: number; refreshSignal?: number }) {
  const { client, notify } = useAdminApplication();
  const [rows, setRows] = useState<AgentInstance[] | null>(null);
  const [failure, setFailure] = useState<Failure | null>(null);
  const [generation, setGeneration] = useState(0);
  const [creating, setCreating] = useState(false);
  useEffect(() => { if (openCreateSignal > 0) setCreating(true); }, [openCreateSignal]);
  const [cancelling, setCancelling] = useState<AgentInstance | null>(null);
  const [activation, setActivation] = useState<string | null>(() => {
    const match = /^\/activate\/([^/]+)\/?$/.exec(window.location.pathname);
    return match ? match[1] : null;
  });
  const refresh = () => setGeneration(value => value + 1);
  useEffect(() => {
    const controller = new AbortController(); setRows(null); setFailure(null);
    void client.request(instancesPath, isInstances, { signal: controller.signal })
      .then(value => { if (!controller.signal.aborted) setRows(value); })
      .catch(error => { if (!controller.signal.aborted) setFailure({ requestId: errorRequestId(error) }); });
    return () => controller.abort();
  }, [client, generation, refreshSignal]);
  function closeActivation() {
    setActivation(null);
    if (window.location.pathname.startsWith("/activate/")) window.history.replaceState(null, "", "/#instances");
  }
  return <section aria-labelledby="instances-heading"><h2 id="instances-heading">实例配对状态</h2>
    <p>新建实例后获得配对码，不设有效期；成功配对后失效，也可在配对前自行取消。</p>

    {failure ? <ErrorState requestId={failure.requestId} onRetry={refresh}>无法加载实例</ErrorState>
      : rows === null ? <LoadingState>正在加载实例…</LoadingState>
      : rows.length === 0 ? <EmptyState>暂无实例</EmptyState>
      : <Table aria-label="Agent 实例"><caption>最近 200 条实例；配对码仅创建时显示</caption><thead><tr><th scope="col">名称</th><th scope="col">状态</th><th scope="col">创建时间</th><th scope="col">实例 ID</th><th scope="col">操作</th></tr></thead>
        <tbody>{rows.map(row => <tr key={row.request_id}><th scope="row">{row.display_name}</th><td>{labels[row.status]}</td>
          <td>{new Date(row.created_at).toLocaleString()}</td><td>{row.instance_id}</td><td>{row.status === "pending" && <Button onClick={() => setCancelling(row)}>取消配对</Button>}</td></tr>)}</tbody></Table>}
    {creating && <CreateInstance close={() => setCreating(false)} changed={refresh} />}
    {cancelling && <CancelInstance instance={cancelling} close={() => setCancelling(null)} changed={() => { setCancelling(null); refresh(); }} />}
    {activation !== null && <ActivateInstance initialId={activation} close={closeActivation} changed={() => {
      closeActivation(); refresh(); hostsChanged(); notify("配对已激活，等待 Agent 确认并上报监控数据。");
    }} />}
  </section>;
}

function CreateInstance({ close, changed }: { close(): void; changed(): void }) {
  const { client } = useAdminApplication();
  const action = useAction();
  const [result, setResult] = useState<CreatedInstance | null>(null);
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const data = new FormData(event.currentTarget);
    void action.run(async signal => {
      const value = await client.request(instancesPath, isCreatedInstance, { method: "POST", signal,
        body: JSON.stringify({ display_name: String(data.get("display_name")).trim() }) });
      if (!signal.aborted) { setResult(value); changed(); }
    });
  }
  return <Dialog title="新建 Agent 实例" onClose={() => { if (action.idle()) close(); }}>
    {result ? <div>
      <p role="status">实例已创建：{result.display_name}</p>
      <p>配对码仅显示这一次。关闭或刷新后无法找回，请安全保存并只用于可信设备。请勿放入网址、日志或分享给他人。</p>
      <FormField label="配对码"><TextField readOnly value={result.activation_code} autoComplete="off" onFocus={event => event.currentTarget.select()} /></FormField>
      <p>配对码不设有效期，配对成功或手动取消后失效。由 Agent 发起配对后，打开其提供的链接，核对设备信息并输入此码。</p>
      <Button onClick={close}>已保存，关闭</Button>
    </div> : <form onSubmit={submit} aria-busy={action.pending}>
      {action.failure && <ErrorState requestId={action.failure.requestId}>创建未能确认。请先刷新实例核对状态；丢失配对码的实例可取消后重新创建，不要重复提交。</ErrorState>}
      <FormField label="实例名称"><InstanceNameField name="display_name" required title="实例名称最多 32 个字符" readOnly={action.pending} data-sarmg-initial-focus /></FormField>
      <p>实例名称最多 32 个字符。</p>
      <div className="sarmg-actions"><Button disabled={action.pending} onClick={close}>取消</Button><Button type="submit" disabled={action.pending}>{action.pending ? "正在创建…" : "创建实例"}</Button></div>
    </form>}
  </Dialog>;
}

function CancelInstance({ instance, close, changed }: { instance: AgentInstance; close(): void; changed(): void }) {
  const { client } = useAdminApplication(); const action = useAction();
  return <ConfirmDangerDialog title="取消配对" description={`取消 ${instance.display_name} 的实例后，其配对码将不可再用。`}
    pending={action.pending} onClose={() => { if (action.idle()) close(); }} onConfirm={() => void action.run(async signal => {
      await client.request(`${instancesPath}/${instance.request_id}`, isNoContent, { method: "DELETE", signal });
      if (!signal.aborted) changed();
    })}>{action.failure && <ErrorState requestId={action.failure.requestId}>取消未能确认，请刷新实例核对状态。</ErrorState>}</ConfirmDangerDialog>;
}

function ActivateInstance({ initialId, close, changed }: { initialId: string; close(): void; changed(): void }) {
  const { client } = useAdminApplication(); const action = useAction();
  const [id, setId] = useState(initialId);
  const [details, setDetails] = useState<PairingSummary | null>(null);
  async function inspect(signal: AbortSignal) {
    const value = await client.request(`/api/v2/host-monitor/pairing-requests/${id}`, isPairingSummary, { signal });
    if (value.request_id !== id) throw new Error("Pairing identity mismatch");
    if (!signal.aborted) setDetails(value);
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = event.currentTarget;
    if (!isUuid(id)) return;
    if (!details) { void action.run(inspect); return; }
    const data = new FormData(form);
    void action.run(async signal => {
      try {
        await client.request("/api/v2/host-monitor/activate-admin", isActivation, { method: "POST", signal,
          body: JSON.stringify({ request_id: details.request_id, activation_code: String(data.get("activation_code") ?? "") }) });
        if (!signal.aborted) changed();
      } finally {
        const code = form.elements.namedItem("activation_code");
        if (code instanceof HTMLInputElement) { code.value = ""; if (!signal.aborted) code.focus(); }
      }
    });
  }
  return <Dialog title="激活 Agent 配对" onClose={() => { if (action.idle()) close(); }}>
    <form onSubmit={submit} aria-busy={action.pending}>
      <p>填写 Agent 提供的配对请求 ID（不是实例 ID），读取并核对设备信息后，输入新建实例时取得的一次性配对码。</p>
      {action.failure && <ErrorState requestId={action.failure.requestId}>请求未能确认。请检查设备请求是否超时及配对状态；配对码本身不设有效期，输入框已清空。不要盲目重试激活。</ErrorState>}
      <FormField label="配对请求 ID"><TextField required value={id} maxLength={36} readOnly={action.pending} data-sarmg-initial-focus
        pattern="[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}"
        onChange={event => { setId(event.target.value); setDetails(null); }} /></FormField>
      {details && <section aria-label="待核对设备"><p>系统：{details.os} / {details.arch}</p>
        <p>配对状态：{details.status}；设备请求会话截止：{new Date(details.expires_at).toLocaleString()}（不是配对码有效期）</p></section>}
      {details?.status === "waiting" && <FormField label="配对码"><TextField name="activation_code" type="password" required maxLength={256} autoComplete="off" readOnly={action.pending} /></FormField>}
      <div className="sarmg-actions"><Button disabled={action.pending} onClick={close}>取消</Button>
        {details && <Button disabled={action.pending} onClick={() => void action.run(inspect)}>刷新配对状态</Button>}
        <Button type="submit" disabled={action.pending || (details !== null && details.status !== "waiting")}>{action.pending ? "正在处理…" : details ? "确认设备并激活" : "读取配对请求"}</Button>
      </div>
    </form>
  </Dialog>;
}

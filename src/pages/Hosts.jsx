import React from "react";
import {
  Icon, StatusDot, StatusPill, Seg, Search, Drawer, Menu, Modal,
  EmptyState, ProxyChain,
} from "../components/ui";
import { hostById, tunnelsByHost } from "../lib/ipc";
import * as ipc from "../lib/ipc";
import { useNotify } from "../components/Confirm";

// Hosts page — same card grid as Tunnels for visual consistency

export default function HostsPage({ hosts, tunnels: allTunnels = [], onSaveHost, onDeleteHost, onReloadHosts, onBulkDelete, startCreate, startImport, onConsumeIntent }) {
  const notify = useNotify();
  const [q, setQ] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState("all");
  const [selected, setSelected] = React.useState(null);
  const [showEdit, setShowEdit] = React.useState(startCreate ? "new" : null);
  const [showImport, setShowImport] = React.useState(!!startImport);

  // multi-select state
  const [selectMode, setSelectMode] = React.useState(false);
  const [selectedIds, setSelectedIds] = React.useState(() => new Set());
  const [testingAll, setTestingAll] = React.useState(false);

  const toggleSelect = (id) => setSelectedIds(prev => {
    const n = new Set(prev);
    n.has(id) ? n.delete(id) : n.add(id);
    return n;
  });
  const exitSelectMode = () => { setSelectMode(false); setSelectedIds(new Set()); };
  const enterSelectMode = () => { setSelectMode(true); setSelectedIds(new Set()); setSelected(null); setShowEdit(null); };

  const testHost = (id) => ipc.testHost(id, false).catch(() => {});  // status updates via event

  const testAll = async () => {
    setTestingAll(true);
    try {
      const ids = hosts.map(h => h.id);
      const concurrency = 5;
      for (let i = 0; i < ids.length; i += concurrency) {
        await Promise.all(
          ids.slice(i, i + concurrency).map(id => ipc.testHost(id, false).catch(() => {}))
        );
      }
    } finally {
      setTestingAll(false);
    }
  };

  const bulkDelete = async () => {
    if (selectedIds.size === 0) return;
    const ok = await onBulkDelete?.([...selectedIds]);
    if (ok) exitSelectMode();
  };

  // One-shot intents — consume so coming back to this page later doesn't
  // re-trigger the same Drawer/Modal.
  React.useEffect(() => {
    if (startCreate) { setShowEdit("new"); onConsumeIntent?.("create"); }
  }, [startCreate, onConsumeIntent]);
  React.useEffect(() => {
    if (startImport) { setShowImport(true); onConsumeIntent?.("import"); }
  }, [startImport, onConsumeIntent]);

  const editingHost = showEdit === "new" ? null : (showEdit ? hosts.find(h => h.id === showEdit) : null);

  // 详情 Drawer 和 编辑 Drawer 互斥：任一打开时关掉另一个
  const openEdit = (id) => { setShowEdit(id); setSelected(null); };
  const openDetail = (id) => { setSelected(id); setShowEdit(null); };

  const filtered = hosts.filter(h => {
    if (q && !h.alias.toLowerCase().includes(q.toLowerCase()) && !h.hostname.toLowerCase().includes(q.toLowerCase())) return false;
    if (statusFilter === "ok" && h.status !== "ok") return false;
    if (statusFilter === "issues" && h.status !== "fail") return false;
    return true;
  });

  const sel = hosts.find(h => h.id === selected);
  const ok = hosts.filter(h => h.status === "ok").length;
  const fail = hosts.filter(h => h.status === "fail").length;

  return (
    <div className="page" style={{ display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "16px 22px", borderBottom: "1px solid var(--border)", flexShrink: 0, flexWrap: "wrap" }}>
        {selectMode ? (
          <>
            <span style={{ fontSize: "var(--fs-sm)", fontWeight: 600 }}>
              已选 <span className="mono" style={{ color: "var(--accent)" }}>{selectedIds.size}</span> / {hosts.length}
            </span>
            <button className="btn sm ghost" onClick={() => setSelectedIds(new Set(hosts.map(h => h.id)))}>全选</button>
            <button className="btn sm ghost" onClick={() => setSelectedIds(new Set())}>全不选</button>
            <div style={{ flex: 1 }}/>
            <button className="btn danger solid" disabled={selectedIds.size === 0} onClick={bulkDelete}>
              <Icon name="trash" size={12}/> 删除选中
            </button>
            <button className="btn ghost" onClick={exitSelectMode}>退出选择</button>
          </>
        ) : (
          <>
            <Seg value={statusFilter} onChange={setStatusFilter} options={[
              { value: "all", label: <span>全部 <span className="dim-2 mono" style={{ marginLeft: 4, fontSize: "var(--fs-xs)" }}>{hosts.length}</span></span> },
              { value: "ok", label: <span style={{ color: "var(--ok)" }}>正常 <span className="mono" style={{ marginLeft: 4, fontSize: "var(--fs-xs)" }}>{ok}</span></span> },
              { value: "issues", label: <span style={{ color: fail ? "var(--fail)" : "var(--fg-2)" }}>有问题 <span className="mono" style={{ marginLeft: 4, fontSize: "var(--fs-xs)" }}>{fail}</span></span> },
            ]}/>
            <Search value={q} onChange={setQ} placeholder="按 alias 或 hostname 搜索…"/>
            <div style={{ flex: 1 }}/>
            <button className="btn" disabled={hosts.length === 0 || testingAll} onClick={testAll}>
              <Icon name={testingAll ? "sync" : "test"} size={12} className={testingAll ? "spin" : undefined}/> {testingAll ? "测试中…" : "测试全部"}
            </button>
            <button className="btn ghost" disabled={hosts.length === 0} onClick={enterSelectMode}>
              <Icon name="check" size={12}/> 选择
            </button>
            <button className="btn" onClick={() => setShowImport(true)}>
              <Icon name="import" size={12}/> 导入
            </button>
            <button className="btn primary" onClick={() => openEdit("new")}>
              <Icon name="plus" size={12}/> 新建主机
            </button>
          </>
        )}
      </div>

      <div style={{ flex: 1, overflow: "auto", padding: "14px 18px" }}>
        {filtered.length === 0 && (
          <EmptyState
            title={hosts.length === 0 ? "还没有主机" : "没有匹配的主机"}
            hint={hosts.length === 0 ? "可以手动添加，或开启「自动同步 ~/.ssh/config」自动导入。" : "调整筛选或搜索。"}
            cta={hosts.length === 0 ? { label: "新建主机", onClick: () => openEdit("new") } : null}
            icon="host"
          />
        )}
        <div style={{ display: "flex", flexDirection: "column", gap: 8, maxWidth: 1100, margin: "0 auto", width: "100%" }}>
          {filtered.map(h => (
            <HostCard
              key={h.id}
              host={h}
              hosts={hosts}
              tunnels={tunnelsByHost(h.id, allTunnels)}
              selectMode={selectMode}
              selected={selectedIds.has(h.id)}
              onToggleSelect={() => toggleSelect(h.id)}
              onSelect={() => openDetail(h.id)}
              onEdit={() => openEdit(h.id)}
              onDelete={() => onDeleteHost?.(h.id)}
              onTest={() => testHost(h.id)}
            />
          ))}
        </div>
      </div>

      <Drawer
        open={!!sel}
        onClose={() => setSelected(null)}
        width={520}
        title={sel && <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
          <StatusDot status={sel.status}/> {sel.alias}
        </span>}
        footer={sel && <>
          <button className="btn ghost" onClick={() => openEdit(sel.id)}>编辑</button>
          <div style={{ flex: 1 }}/>
          <button className="btn" onClick={() => testHost(sel.id)} disabled={sel.status === "checking"}>
            <Icon name={sel.status === "checking" ? "sync" : "test"} size={11} className={sel.status === "checking" ? "spin" : undefined}/>
            {sel.status === "checking" ? " 测试中…" : " 测试连通性"}
          </button>
        </>}
      >
        {sel && <HostDetail host={sel} tunnels={tunnelsByHost(sel.id, allTunnels)}/>}
      </Drawer>

      <Drawer
        open={!!showEdit}
        onClose={() => setShowEdit(null)}
        width={520}
        title={showEdit === "new" ? "新建主机" : `编辑 — ${editingHost?.alias || ""}`}
        footer={<>
          <button className="btn ghost" onClick={() => setShowEdit(null)}>取消</button>
          <div style={{ flex: 1 }}/>
          <button className="btn primary" type="submit" form="host-edit-form">保存</button>
        </>}
      >
        {showEdit && (
          <HostForm
            key={showEdit}
            host={editingHost}
            hosts={hosts}
            onSubmit={async (h) => {
              try {
                await onSaveHost?.(h);
                setShowEdit(null);
              } catch (e) {
                notify({ title: "保存主机失败", message: e.message || String(e), kind: "error" });
              }
            }}
          />
        )}
      </Drawer>

      <ImportFromSshConfigModal
        open={showImport}
        onClose={() => setShowImport(false)}
        onImported={async () => {
          await onReloadHosts?.();
          setShowImport(false);
        }}
      />
    </div>
  );
}

// Flat row layout — columns line up across cards for a table-like read.
// Columns are FIXED widths (except the user@host column which flexes) so
// per-card grids produce identical column tracks. `auto`/`minmax(..,auto)`
// would let long content (e.g. "connection timed out") balloon one cell
// and push other cells out of alignment across rows.
const HOST_ROW_COLS_NORMAL = "34px 180px minmax(180px, 1fr) 130px 170px 18px 32px";
const HOST_ROW_COLS_SELECT = "20px 34px 180px minmax(180px, 1fr) 130px 170px 18px";

function HostCard({ host, hosts, tunnels, selectMode, selected, onToggleSelect, onSelect, onEdit, onDelete, onTest }) {
  const isProblem = host.status === "fail";
  const isChecking = host.status === "checking";
  const handleClick = () => {
    if (selectMode) onToggleSelect?.();
    else onSelect?.();
  };
  return (
    <div
      onClick={handleClick}
      style={{
        border: selected ? "1px solid var(--accent)" : "1px solid var(--border)",
        borderLeft: isProblem && !selected ? "3px solid var(--fail)" : (selected ? "1px solid var(--accent)" : "1px solid var(--border)"),
        background: selected ? "color-mix(in oklch, var(--accent) 6%, var(--bg-1))" : "var(--bg-1)",
        padding: "14px 22px",
        display: "grid",
        gridTemplateColumns: selectMode ? HOST_ROW_COLS_SELECT : HOST_ROW_COLS_NORMAL,
        alignItems: "center",
        gap: 14,
        cursor: "default",
        transition: "background .12s, border-color .12s",
        minWidth: 0,
      }}
      onMouseEnter={e => { if (!selected) e.currentTarget.style.background = "var(--bg-2)"; }}
      onMouseLeave={e => { if (!selected) e.currentTarget.style.background = "var(--bg-1)"; }}
    >
      {selectMode && (
        <input
          type="checkbox"
          checked={!!selected}
          onChange={onToggleSelect}
          onClick={e => e.stopPropagation()}
          style={{ width: 16, height: 16, margin: 0 }}
        />
      )}

      {/* badge */}
      <span style={{
        display: "inline-grid", placeItems: "center",
        width: 34, height: 34,
        background: host.source === "config" ? "color-mix(in oklch, var(--info) 18%, var(--bg-2))" : "color-mix(in oklch, var(--fg-2) 16%, var(--bg-2))",
        color: host.source === "config" ? "var(--info)" : "var(--fg-2)",
      }}>
        <Icon name="host" size={17}/>
      </span>

      {/* alias */}
      <span style={{
        fontWeight: 600, fontSize: "var(--fs-md)",
        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        letterSpacing: "-0.01em",
      }}>
        {host.alias}
      </span>

      {/* user@host:port */}
      <span className="mono tr" style={{ fontSize: "var(--fs-sm)", color: "var(--fg-1)", minWidth: 0 }} title={`${host.user}@${host.hostname}:${host.port}`}>
        <span style={{ color: "var(--accent)" }}>{host.user}</span>
        <span className="dim-2">@</span>
        <span>{host.hostname}</span>
        <span className="dim-2">:{host.port}</span>
      </span>

      {/* proxy / direct */}
      <span className="dim-2" style={{
        display: "inline-flex", alignItems: "center", gap: 6,
        fontSize: "var(--fs-xs)", minWidth: 0,
      }} title={host.proxy_jump ? `经 ${hostById(host.proxy_jump, hosts)?.alias}` : "直连"}>
        {host.proxy_jump
          ? <><Icon name="tunnel" size={12}/> <span className="tr" style={{ minWidth: 0 }}>经 <span className="mono" style={{ color: "var(--fg-1)" }}>{hostById(host.proxy_jump, hosts)?.alias}</span></span></>
          : <><Icon name="wifi" size={12}/> 直连</>
        }
      </span>

      {/* tunnels count / error */}
      <span style={{ fontSize: "var(--fs-xs)", minWidth: 0, overflow: "hidden" }}>
        {host.last_error && host.status === "fail"
          ? <span className="mono tr" style={{ color: "var(--fail)", display: "inline-block", maxWidth: "100%" }} title={host.last_error}>
              {host.last_error}
            </span>
          : tunnels.length > 0
            ? <span className="dim-2"><span className="mono" style={{ color: "var(--fg-1)" }}>{tunnels.length}</span> 条隧道在用</span>
            : <span className="dim-2">未使用</span>
        }
      </span>

      {/* status */}
      <span style={{ display: "inline-grid", placeItems: "center" }}>
        {isChecking
          ? <Icon name="sync" size={14} className="spin" style={{ color: "var(--info)" }}/>
          : <StatusDot status={host.status} size={10}/>}
      </span>

      {/* menu — hidden in select mode (also dropped from grid template) */}
      {!selectMode && (
        <Menu items={[
          { label: "测试连通性", icon: "test", onClick: onTest, disabled: isChecking },
          "-",
          { label: "编辑", icon: "edit", onClick: onEdit },
          "-",
          { label: "删除", icon: "trash", danger: true, onClick: onDelete },
        ]}/>
      )}
    </div>
  );
}

function HostDetail({ host, tunnels }) {
  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", columnGap: 18, rowGap: 14, alignItems: "center", marginBottom: 20 }}>
        <span className="dim-2" style={{ fontSize: "var(--fs-xs)", textTransform: "uppercase", letterSpacing: ".06em" }}>地址</span>
        <span className="mono" style={{ fontSize: "var(--fs-sm)" }}>{host.user}@{host.hostname}:{host.port}</span>

        <span className="dim-2" style={{ fontSize: "var(--fs-xs)", textTransform: "uppercase", letterSpacing: ".06em" }}>私钥</span>
        <span className="mono" style={{ fontSize: "var(--fs-sm)" }}>{host.identity_file || <span className="dim-2">默认 / ssh-agent</span>}</span>

        <span className="dim-2" style={{ fontSize: "var(--fs-xs)", textTransform: "uppercase", letterSpacing: ".06em" }}>连接路径</span>
        <span style={{ fontSize: "var(--fs-sm)" }}><ProxyChain host={host}/></span>

        <span className="dim-2" style={{ fontSize: "var(--fs-xs)", textTransform: "uppercase", letterSpacing: ".06em" }}>状态</span>
        <span><StatusPill status={host.status}/></span>

        <span className="dim-2" style={{ fontSize: "var(--fs-xs)", textTransform: "uppercase", letterSpacing: ".06em" }}>来源</span>
        <span style={{ fontSize: "var(--fs-sm)" }}>
          {host.source === "config" ? "ssh config" : "手动添加"}
        </span>
      </div>

      {host.last_error && host.status === "fail" && (
        <div style={{
          border: "1px solid color-mix(in oklch, var(--fail) 30%, var(--border))",
          background: "color-mix(in oklch, var(--fail) 6%, var(--bg-1))",
          borderRadius: "var(--radius)", padding: "12px 14px", marginBottom: 20,
        }}>
          <div className="dim-2" style={{ fontSize: "var(--fs-xs)", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 6, color: "var(--fail)" }}>
            <Icon name="warn" size={10} style={{ verticalAlign: "-1px", marginRight: 4 }}/> 最近错误
          </div>
          <div className="mono" style={{ fontSize: "var(--fs-sm)", color: "var(--fail)", lineHeight: 1.55 }}>{host.last_error}</div>
        </div>
      )}

      {tunnels.length > 0 && (
        <>
          <div className="dim-2" style={{ fontSize: "var(--fs-xs)", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 8 }}>
            关联的隧道（{tunnels.length}）
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {tunnels.map(t => (
              <div key={t.id} style={{
                display: "flex", alignItems: "center", gap: 10,
                padding: "8px 12px",
                background: "var(--bg-2)",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius)",
              }}>
                <StatusDot status={t.status}/>
                <span style={{ fontWeight: 500, fontSize: "var(--fs-sm)" }}>{t.name}</span>
                <span className="mono dim-2" style={{ fontSize: "var(--fs-xs)" }}>
                  {t.type}:{t.local_port}
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

const NIL_UUID = "00000000-0000-0000-0000-000000000000";

function HostForm({ host, hosts, onSubmit }) {
  const [form, setForm] = React.useState(() => ({
    id: host?.id || NIL_UUID,
    alias: host?.alias || "",
    hostname: host?.hostname || "",
    port: host?.port ?? 22,
    user: host?.user || "",
    identity_file: host?.identity_file ?? "",
    proxy_jump: host?.proxy_jump ?? "",
    source: host?.source || "manual",
    status: host?.status || "unknown",
    last_error: host?.last_error ?? null,
  }));
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = (e) => {
    e.preventDefault();
    const payload = {
      ...form,
      port: parseInt(form.port, 10) || 22,
      identity_file: form.identity_file ? form.identity_file : null,
      proxy_jump: form.proxy_jump ? form.proxy_jump : null,
    };
    onSubmit?.(payload);
  };

  return (
    <form id="host-edit-form" onSubmit={handleSubmit}>
      <div className="field">
        <label>alias</label>
        <input className="input mono" value={form.alias} onChange={e => set("alias", e.target.value)} placeholder="my-bastion" autoFocus required/>
      </div>
      <div className="field">
        <label>hostname</label>
        <input className="input mono" value={form.hostname} onChange={e => set("hostname", e.target.value)} placeholder="bastion.example.com" required/>
      </div>
      <div className="row-2">
        <div className="field">
          <label>用户名</label>
          <input className="input mono" value={form.user} onChange={e => set("user", e.target.value)} placeholder="deploy" required/>
        </div>
        <div className="field">
          <label>端口</label>
          <input className="input mono" value={form.port} onChange={e => set("port", e.target.value)} type="number" min="1" max="65535"/>
        </div>
      </div>
      <div className="field">
        <label>私钥路径 <span className="dim-2">（可选）</span></label>
        <input className="input mono" value={form.identity_file || ""} onChange={e => set("identity_file", e.target.value)} placeholder="~/.ssh/id_ed25519 — 留空走 ssh-agent / 默认"/>
      </div>
      <div className="field">
        <label>跳板主机 <span className="dim-2">（可选）</span></label>
        <select className="select" value={form.proxy_jump || ""} onChange={e => set("proxy_jump", e.target.value)}>
          <option value="">直连</option>
          {hosts.filter(h => h.id !== host?.id).map(h => <option key={h.id} value={h.id}>{h.alias}</option>)}
        </select>
        <span className="help">需要先经过另一台主机才能到达时使用。</span>
      </div>
    </form>
  );
}

// ssh config 主机导入 — 打开时调 parse_ssh_config_hosts 拉真实候选；
// 用户勾选后调 import_hosts 写入，已存在的 alias 后端会跳过不覆盖。
function ImportFromSshConfigModal({ open, onClose, onImported }) {
  const notify = useNotify();
  const [candidates, setCandidates] = React.useState([]);
  const [loading, setLoading] = React.useState(false);
  const [loadError, setLoadError] = React.useState(null);
  const [checked, setChecked] = React.useState(() => new Set());
  const [submitting, setSubmitting] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setLoading(true);
    setLoadError(null);
    ipc.parseSshConfigHosts()
      .then(cs => {
        setCandidates(cs);
        // 默认只勾未存在的
        setChecked(new Set(cs.filter(c => !c.exists).map(c => c.alias)));
      })
      .catch(e => setLoadError(e.message || String(e)))
      .finally(() => setLoading(false));
  }, [open]);

  const toggle = (alias) => setChecked(prev => {
    const n = new Set(prev);
    n.has(alias) ? n.delete(alias) : n.add(alias);
    return n;
  });
  const allOn = () => setChecked(new Set(candidates.map(c => c.alias)));
  const allOff = () => setChecked(new Set());
  const newOnly = candidates.filter(c => !c.exists).length;

  const doImport = async () => {
    const selected = candidates.filter(c => checked.has(c.alias));
    if (selected.length === 0) return;
    setSubmitting(true);
    try {
      await ipc.importHosts(selected);
      await onImported?.();
    } catch (e) {
      notify({ title: "导入失败", message: e.message || String(e), kind: "error" });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      width={580}
      title="从 ssh config 导入主机"
      footer={<>
        {loading
          ? <span className="dim-2" style={{ fontSize: "var(--fs-xs)" }}>解析中…</span>
          : <span className="dim-2" style={{ fontSize: "var(--fs-xs)" }}>
              扫描到 {candidates.length} 条 · 新增 {newOnly}
            </span>}
        <div style={{ flex: 1 }}/>
        <button className="btn ghost" onClick={onClose} disabled={submitting}>取消</button>
        <button className="btn primary" disabled={checked.size === 0 || submitting} onClick={doImport}>
          {submitting ? "导入中…" : `导入 ${checked.size} 条`}
        </button>
      </>}
    >
      {loading && <div className="dim" style={{ padding: "30px 0", textAlign: "center" }}>读取 ssh config…</div>}
      {loadError && (
        <div style={{
          border: "1px solid color-mix(in oklch, var(--fail) 30%, var(--border))",
          background: "color-mix(in oklch, var(--fail) 6%, var(--bg-1))",
          borderRadius: "var(--radius)", padding: "10px 12px",
          fontSize: "var(--fs-sm)", color: "var(--fail)",
        }}>{loadError}</div>
      )}
      {!loading && !loadError && candidates.length === 0 && (
        <div className="dim" style={{ padding: "30px 0", textAlign: "center" }}>
          ssh config 里没有可导入的主机
        </div>
      )}
      {!loading && candidates.length > 0 && (
        <>
          <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
            <button className="btn sm ghost" onClick={allOn}>全选</button>
            <button className="btn sm ghost" onClick={allOff}>全不选</button>
          </div>
          {candidates.map(c => (
            <label key={c.alias} style={{
              display: "grid", gridTemplateColumns: "auto 22px 1fr auto", gap: 10,
              alignItems: "center", padding: "10px 8px",
              borderBottom: "1px solid var(--border)",
              cursor: "default",
              opacity: c.exists ? 0.6 : 1,
            }}>
              <input type="checkbox" checked={checked.has(c.alias)} onChange={() => toggle(c.alias)} disabled={c.exists}/>
              <Icon name="host" size={12} style={{ color: "var(--fg-3)" }}/>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: "var(--fs-sm)", fontWeight: 500 }}>{c.alias}</div>
                <div className="mono dim-2 tr" style={{ fontSize: "var(--fs-xs)" }}>
                  {c.user}@{c.hostname}:{c.port}
                </div>
              </div>
              {c.exists
                ? <span className="dim-2" style={{ fontSize: "var(--fs-xs)" }}>已存在</span>
                : <span style={{ color: "var(--ok)", fontSize: "var(--fs-xs)" }}>新</span>
              }
            </label>
          ))}
        </>
      )}
    </Modal>
  );
}

import React from "react";
import {
  Icon, StatusDot, StatusPill, Seg, Search, Drawer, Menu, Modal,
  EmptyState, ProxyChain, Toggle, Select,
} from "../components/ui";
import { hostById, formatUptime, sshCommand } from "../lib/ipc";
import * as ipc from "../lib/ipc";
import { useNotify } from "../components/Confirm";

// Tunnels page — the primary view

export default function TunnelsPage({ tunnels, hosts, onTunnelAction, onSaveTunnel, onReloadTunnels, onBulkDelete, focus, startCreate, startImport, onConsumeIntent }) {
  const notify = useNotify();
  const [q, setQ] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState("all");
  const [selected, setSelected] = React.useState(focus || null);
  const [showEdit, setShowEdit] = React.useState(startCreate ? "new" : null);
  const [showImport, setShowImport] = React.useState(!!startImport);

  // multi-select state
  const [selectMode, setSelectMode] = React.useState(false);
  const [selectedIds, setSelectedIds] = React.useState(() => new Set());

  const toggleSelect = (id) => setSelectedIds(prev => {
    const n = new Set(prev);
    n.has(id) ? n.delete(id) : n.add(id);
    return n;
  });
  const exitSelectMode = () => { setSelectMode(false); setSelectedIds(new Set()); };
  const enterSelectMode = () => { setSelectMode(true); setSelectedIds(new Set()); setSelected(null); setShowEdit(null); };

  const bulkDelete = async () => {
    if (selectedIds.size === 0) return;
    const ok = await onBulkDelete?.([...selectedIds]);
    if (ok) exitSelectMode();
  };

  // Consume one-shot intents on mount so re-navigating here later doesn't
  // re-open the same Drawer/Modal.
  React.useEffect(() => {
    if (focus) { setSelected(focus); onConsumeIntent?.("focus"); }
  }, [focus, onConsumeIntent]);
  React.useEffect(() => {
    if (startCreate) { setShowEdit("new"); onConsumeIntent?.("create"); }
  }, [startCreate, onConsumeIntent]);
  React.useEffect(() => {
    if (startImport) { setShowImport(true); onConsumeIntent?.("import"); }
  }, [startImport, onConsumeIntent]);

  const editingTunnel = showEdit === "new" ? null : (showEdit ? tunnels.find(t => t.id === showEdit) : null);

  // 详情 Drawer 和 编辑 Drawer 互斥
  const openEdit = (id) => { setShowEdit(id); setSelected(null); };
  const openDetail = (id) => { setSelected(id); setShowEdit(null); };

  const filtered = tunnels.filter(t => {
    if (q && !t.name.toLowerCase().includes(q.toLowerCase()) && !String(t.local_port).includes(q)) return false;
    if (statusFilter === "active" && !["connected", "reconnecting"].includes(t.status)) return false;
    if (statusFilter === "issues" && !["failed", "reconnecting"].includes(t.status)) return false;
    return true;
  });

  const sel = tunnels.find(t => t.id === selected);
  const active = tunnels.filter(t => t.status === "connected").length;
  const issues = tunnels.filter(t => ["failed", "reconnecting"].includes(t.status)).length;

  return (
    <div className="page" style={{ display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "16px 22px", borderBottom: "1px solid var(--border)", flexShrink: 0, flexWrap: "wrap" }}>
        {selectMode ? (
          <>
            <span style={{ fontSize: "var(--fs-sm)", fontWeight: 600 }}>
              已选 <span className="mono" style={{ color: "var(--accent)" }}>{selectedIds.size}</span> / {tunnels.length}
            </span>
            <button className="btn sm ghost" onClick={() => setSelectedIds(new Set(tunnels.map(t => t.id)))}>全选</button>
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
              { value: "all", label: <span>全部 <span className="dim-2 mono" style={{ marginLeft: 4, fontSize: "var(--fs-xs)" }}>{tunnels.length}</span></span> },
              { value: "active", label: <span style={{ color: "var(--ok)" }}>在线 <span className="mono" style={{ marginLeft: 4, fontSize: "var(--fs-xs)" }}>{active}</span></span> },
              { value: "issues", label: <span style={{ color: issues ? "var(--fail)" : "var(--fg-2)" }}>有问题 <span className="mono" style={{ marginLeft: 4, fontSize: "var(--fs-xs)" }}>{issues}</span></span> },
            ]}/>
            <Search value={q} onChange={setQ} placeholder="按名称或端口搜索…"/>
            <div style={{ flex: 1 }}/>
            <button className="btn ghost" disabled={tunnels.length === 0} onClick={enterSelectMode}>
              <Icon name="check" size={12}/> 选择
            </button>
            <button className="btn" onClick={() => setShowImport(true)}>
              <Icon name="import" size={12}/> 导入
            </button>
            <button className="btn primary" onClick={() => openEdit("new")}>
              <Icon name="plus" size={12}/> 新建隧道
            </button>
          </>
        )}
      </div>

      <div style={{ flex: 1, overflow: "auto", padding: "14px 18px" }}>
        {filtered.length === 0 && (
          <EmptyState
            title={tunnels.length === 0 ? "还没有隧道" : "没有匹配的隧道"}
            hint={tunnels.length === 0 ? "新建一条隧道，把远端服务的端口映射到本地。" : "调整筛选或搜索。"}
            cta={tunnels.length === 0 ? { label: "新建隧道", onClick: () => openEdit("new") } : null}
          />
        )}
        <div style={{ display: "flex", flexDirection: "column", gap: 8, maxWidth: 1100, margin: "0 auto", width: "100%" }}>
          {filtered.map(t => (
            <TunnelCard
              key={t.id}
              tunnel={t}
              host={hostById(t.host_id, hosts)}
              selectMode={selectMode}
              selected={selectedIds.has(t.id)}
              onToggleSelect={() => toggleSelect(t.id)}
              onSelect={() => openDetail(t.id)}
              onAction={(action) => onTunnelAction(t.id, action)}
              onEdit={() => openEdit(t.id)}
            />
          ))}
        </div>
      </div>

      <Drawer
        open={!!sel}
        onClose={() => setSelected(null)}
        width={520}
        title={sel && <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
          <StatusDot status={sel.status}/> {sel.name}
        </span>}
        footer={sel && (
          ["connected", "reconnecting"].includes(sel.status)
            ? <>
                <button className="btn ghost" onClick={() => openEdit(sel.id)}>编辑</button>
                <div style={{ flex: 1 }}/>
                <button className="btn" onClick={() => onTunnelAction(sel.id, "restart")}><Icon name="restart" size={11}/> 重启</button>
                <button className="btn danger" onClick={() => onTunnelAction(sel.id, "stop")}><Icon name="stop" size={11}/> 停止</button>
              </>
            : <>
                <button className="btn ghost" onClick={() => openEdit(sel.id)}>编辑</button>
                <div style={{ flex: 1 }}/>
                <button className="btn primary" onClick={() => onTunnelAction(sel.id, "start")}><Icon name="play" size={11}/> 启动</button>
              </>
        )}
      >
        {sel && <TunnelDetail tunnel={sel} host={hostById(sel.host_id, hosts)}/>}
      </Drawer>

      <Drawer
        open={!!showEdit}
        onClose={() => setShowEdit(null)}
        width={520}
        title={showEdit === "new" ? "新建隧道" : `编辑 — ${editingTunnel?.name || ""}`}
        footer={<>
          <button className="btn ghost" onClick={() => setShowEdit(null)}>取消</button>
          <div style={{ flex: 1 }}/>
          <button className="btn primary" type="submit" form="tunnel-edit-form">保存</button>
        </>}
      >
        {showEdit && (
          <TunnelForm
            key={showEdit}
            tunnel={editingTunnel}
            hosts={hosts}
            onSubmit={async (t) => {
              try {
                await onSaveTunnel?.(t);
                setShowEdit(null);
              } catch (e) {
                notify({ title: "保存隧道失败", message: e.message || String(e), kind: "error" });
              }
            }}
          />
        )}
      </Drawer>

      <ImportFromSshConfigModal
        open={showImport}
        onClose={() => setShowImport(false)}
        onImported={async () => {
          await onReloadTunnels?.();
          setShowImport(false);
        }}
        hosts={hosts}
      />

    </div>
  );
}

// Flat row layout — fixed column widths so all card grids agree on
// column tracks; otherwise long error strings would push neighbouring
// cells out of alignment across cards.
// Cols: [checkbox?] badge | name | forward | host | status+uptime | start/stop | menu
const TUNNEL_ROW_COLS_NORMAL = "34px 160px minmax(180px, 1fr) 140px 160px 72px 32px";
const TUNNEL_ROW_COLS_SELECT = "20px 34px 160px minmax(180px, 1fr) 140px 160px 72px";

function TunnelCard({ tunnel, host, selectMode, selected, onToggleSelect, onSelect, onAction, onEdit }) {
  const isUp = ["connected", "reconnecting"].includes(tunnel.status);
  const isProblem = ["failed", "reconnecting"].includes(tunnel.status);
  const handleClick = () => {
    if (selectMode) onToggleSelect?.();
    else onSelect?.();
  };
  return (
    <div
      onClick={handleClick}
      style={{
        border: selected ? "1px solid var(--accent)" : "1px solid var(--border)",
        borderLeft: selected
          ? "1px solid var(--accent)"
          : (isProblem ? `3px solid ${tunnel.status === "failed" ? "var(--fail)" : "var(--warn)"}` : "1px solid var(--border)"),
        background: selected ? "color-mix(in oklch, var(--accent) 6%, var(--bg-1))" : "var(--bg-1)",
        padding: "12px 22px",
        display: "grid",
        gridTemplateColumns: selectMode ? TUNNEL_ROW_COLS_SELECT : TUNNEL_ROW_COLS_NORMAL,
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

      {/* type badge */}
      <span className="mono" style={{
        display: "inline-grid", placeItems: "center",
        width: 34, height: 34,
        background: tunnel.type === "L" ? "color-mix(in oklch, var(--info) 18%, var(--bg-2))" : tunnel.type === "R" ? "color-mix(in oklch, var(--accent) 18%, var(--bg-2))" : "color-mix(in oklch, #c084fc 18%, var(--bg-2))",
        color: tunnel.type === "L" ? "var(--info)" : tunnel.type === "R" ? "var(--accent)" : "#c084fc",
        fontSize: 14, fontWeight: 700,
      }}>{tunnel.type}</span>

      {/* name */}
      <span style={{
        fontWeight: 600, fontSize: "var(--fs-md)",
        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        letterSpacing: "-0.01em",
      }}>{tunnel.name}</span>

      {/* forward */}
      <span className="mono tr" style={{ fontSize: "var(--fs-sm)", color: "var(--fg-1)", minWidth: 0 }} title={tunnel.type === "D" ? `SOCKS5 :${tunnel.local_port}` : `:${tunnel.local_port} → ${tunnel.remote_host}:${tunnel.remote_port}`}>
        {tunnel.type === "D"
          ? <><span className="dim-2">SOCKS5</span> <span style={{ color: "var(--accent)" }}>:{tunnel.local_port}</span></>
          : <><span style={{ color: "var(--accent)" }}>:{tunnel.local_port}</span> <span className="dim-2"> → </span><span>{tunnel.remote_host}:{tunnel.remote_port}</span></>
        }
      </span>

      {/* host */}
      <span className="dim-2 tr" style={{
        display: "inline-flex", alignItems: "center", gap: 6,
        fontSize: "var(--fs-xs)", minWidth: 0,
      }} title={host?.alias}>
        <Icon name="host" size={12} style={{ flexShrink: 0 }}/>
        <span className="tr" style={{ minWidth: 0 }}>{host?.alias}</span>
      </span>

      {/* status + uptime / error */}
      <span style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: "var(--fs-xs)", minWidth: 0, overflow: "hidden" }}>
        <StatusDot status={tunnel.status} size={9}/>
        <span className="tr" style={{ minWidth: 0 }}>
          {tunnel.last_error && tunnel.status !== "connected"
            ? <span className="mono" style={{ color: "var(--fail)" }} title={tunnel.last_error}>{tunnel.last_error}</span>
            : tunnel.status === "connected" && tunnel.started_at
              ? <span className="dim-2">在线 <span className="mono" style={{ color: "var(--fg-1)" }}>{formatUptime(Math.floor((Date.now() - tunnel.started_at) / 1000))}</span></span>
              : tunnel.status === "reconnecting"
                ? <span style={{ color: "var(--warn)" }}>重连中</span>
                : tunnel.status === "connecting"
                  ? <span style={{ color: "var(--info)" }}>连接中</span>
                  : <span className="dim-2">未启动</span>
          }
        </span>
      </span>

      {/* start/stop — hidden in select mode (also dropped from template) */}
      {!selectMode && (isUp
        ? <button
            onClick={(e) => { e.stopPropagation(); onAction("stop"); }}
            title="停止"
            style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              height: 32, padding: "0 12px 0 10px",
              border: "1px solid color-mix(in oklch, var(--fail) 35%, var(--border))",
              background: "color-mix(in oklch, var(--fail) 10%, var(--bg-1))",
              color: "var(--fail)",
              fontSize: "var(--fs-xs)", fontWeight: 600,
            }}
          >
            <Icon name="stop" size={12}/> 停止
          </button>
        : <button
            onClick={(e) => { e.stopPropagation(); onAction("start"); }}
            title="启动"
            style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              height: 32, padding: "0 12px 0 10px",
              border: "1px solid var(--accent)",
              background: "var(--accent)",
              color: "#07120c",
              fontSize: "var(--fs-xs)", fontWeight: 700,
            }}
          >
            <Icon name="play" size={12}/> 启动
          </button>
      )}

      {/* menu */}
      {!selectMode && (
        <Menu items={[
          { label: "启动", icon: "play", onClick: () => onAction("start"), disabled: isUp },
          { label: "停止", icon: "stop", onClick: () => onAction("stop"), disabled: !isUp },
          { label: "重启", icon: "restart", onClick: () => onAction("restart"), disabled: !isUp },
          "-",
          { label: "编辑", icon: "edit", onClick: onEdit },
          "-",
          { label: "删除", icon: "trash", danger: true, onClick: () => onAction("delete") },
        ]}/>
      )}
    </div>
  );
}

function TunnelDetail({ tunnel, host }) {
  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", columnGap: 18, rowGap: 14, alignItems: "center", marginBottom: 20 }}>
        <span className="dim-2" style={{ fontSize: "var(--fs-xs)", textTransform: "uppercase", letterSpacing: ".06em" }}>类型</span>
        <span style={{ fontSize: "var(--fs-sm)" }}>
          {tunnel.type === "L" && "本地转发（-L）"}
          {tunnel.type === "R" && "远程转发（-R）"}
          {tunnel.type === "D" && "动态 SOCKS5 代理（-D）"}
        </span>

        <span className="dim-2" style={{ fontSize: "var(--fs-xs)", textTransform: "uppercase", letterSpacing: ".06em" }}>映射</span>
        <span className="mono" style={{ fontSize: "var(--fs-sm)" }}>
          {(() => {
            const bind = tunnel.bind_address || "127.0.0.1";
            if (tunnel.type === "D") {
              return `[本地] ${bind}:${tunnel.local_port}  →  SOCKS5`;
            }
            if (tunnel.type === "R") {
              return `[远端] ${bind}:${tunnel.local_port}  →  [本机] ${tunnel.remote_host}:${tunnel.remote_port}`;
            }
            return `[本地] ${bind}:${tunnel.local_port}  →  [远端] ${tunnel.remote_host}:${tunnel.remote_port}`;
          })()}
        </span>

        <span className="dim-2" style={{ fontSize: "var(--fs-xs)", textTransform: "uppercase", letterSpacing: ".06em" }}>经</span>
        <span style={{ fontSize: "var(--fs-sm)" }}>{host && <ProxyChain host={host}/>}</span>

        <span className="dim-2" style={{ fontSize: "var(--fs-xs)", textTransform: "uppercase", letterSpacing: ".06em" }}>状态</span>
        <span><StatusPill status={tunnel.status}/></span>

        {tunnel.status === "connected" && tunnel.started_at && (
          <>
            <span className="dim-2" style={{ fontSize: "var(--fs-xs)", textTransform: "uppercase", letterSpacing: ".06em" }}>在线时长</span>
            <span className="mono" style={{ fontSize: "var(--fs-sm)" }}>{formatUptime(Math.floor((Date.now() - tunnel.started_at) / 1000))}</span>
          </>
        )}
      </div>

      {tunnel.last_error && tunnel.status !== "connected" && (
        <div style={{
          border: "1px solid color-mix(in oklch, var(--fail) 30%, var(--border))",
          background: "color-mix(in oklch, var(--fail) 6%, var(--bg-1))",
          borderRadius: "var(--radius)", padding: "12px 14px", marginBottom: 20,
        }}>
          <div className="dim-2" style={{ fontSize: "var(--fs-xs)", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 6, color: "var(--fail)" }}>
            <Icon name="warn" size={10} style={{ verticalAlign: "-1px", marginRight: 4 }}/> 最近错误
          </div>
          <div className="mono" style={{ fontSize: "var(--fs-sm)", color: "var(--fail)", lineHeight: 1.55 }}>{tunnel.last_error}</div>
        </div>
      )}

      <div className="dim-2" style={{ fontSize: "var(--fs-xs)", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 8 }}>
        等价 ssh 命令
      </div>
      <pre style={{
        background: "var(--bg-2)", border: "1px solid var(--border)",
        borderRadius: "var(--radius)", padding: "12px 14px", margin: 0,
        fontFamily: "var(--mono)", fontSize: "var(--fs-sm)", color: "var(--fg-1)",
        whiteSpace: "pre-wrap", lineHeight: 1.6,
      }}>{sshCommand(tunnel, host)}</pre>
    </div>
  );
}

const NIL_UUID = "00000000-0000-0000-0000-000000000000";

function TunnelForm({ tunnel, hosts, onSubmit }) {
  const notify = useNotify();
  const [form, setForm] = React.useState(() => ({
    id: tunnel?.id || NIL_UUID,
    name: tunnel?.name || "",
    type: tunnel?.type || "L",
    host_id: tunnel?.host_id || (hosts[0]?.id ?? ""),
    local_port: tunnel?.local_port ?? "",
    bind_address: tunnel?.bind_address || "127.0.0.1",
    remote_host: tunnel?.remote_host ?? "",
    remote_port: tunnel?.remote_port ?? "",
    keep_alive: tunnel?.keep_alive ?? true,
    auto_start: tunnel?.auto_start ?? false,
    status: tunnel?.status || "idle",
    started_at: tunnel?.started_at ?? null,
    last_error: tunnel?.last_error ?? null,
  }));
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.host_id) {
      notify({ title: "缺少必填项", message: "请先选择经过主机", kind: "error" });
      return;
    }
    const payload = {
      ...form,
      local_port: parseInt(form.local_port, 10) || (form.type === "D" ? 1080 : 0),
      // bind_address: 127.0.0.1 是默认行为，存 null 让后端拼参数时省略；
      // 其它值（0.0.0.0 / 自定义 IP）保留。
      bind_address: form.bind_address === "127.0.0.1" ? null : (form.bind_address || null),
      remote_host: form.type === "D" ? null : (form.remote_host || null),
      remote_port: form.type === "D" ? null : (parseInt(form.remote_port, 10) || null),
    };
    onSubmit?.(payload);
  };

  return (
    <form id="tunnel-edit-form" onSubmit={handleSubmit}>
      <div className="field">
        <label>名称</label>
        <input className="input" value={form.name} onChange={e => set("name", e.target.value)} autoFocus required/>
      </div>
      <div className="field">
        <label>转发类型</label>
        <Seg value={form.type} onChange={v => set("type", v)} options={[
          { value: "L", label: "本地" },
          { value: "R", label: "远程" },
          { value: "D", label: "SOCKS5" },
        ]}/>
        <span className="help">
          {form.type === "L" && "本地端口 → 远端服务（把远程服务转发到本地访问）"}
          {form.type === "R" && "远端端口 → 本机服务（把本地服务暴露到远端访问）"}
          {form.type === "D" && "本机起一个 SOCKS5 代理"}
        </span>
      </div>
      <div className="field">
        <label>经过主机</label>
        <Select
          value={form.host_id}
          onChange={v => set("host_id", v)}
          disabled={hosts.length === 0}
          placeholder={hosts.length === 0 ? "没有主机，请先在 Hosts 页添加" : "选择主机…"}
          options={hosts.map(h => ({
            value: h.id,
            label: h.alias,
            sub: `${h.user}@${h.hostname}:${h.port}`,
          }))}
        />
      </div>
      {form.type === "R" ? (
        <>
          <div className="row-2">
            <div className="field">
              <label>本地服务 地址</label>
              <input className="input mono" value={form.remote_host || ""} onChange={e => set("remote_host", e.target.value)} placeholder="localhost" required/>
            </div>
            <div className="field">
              <label>本地服务 端口</label>
              <input className="input mono" value={form.remote_port || ""} onChange={e => set("remote_port", e.target.value)} type="number" min="1" max="65535" required/>
            </div>
          </div>
          <div style={{
            display: "flex", alignItems: "center", gap: 8,
            margin: "2px 0 10px", color: "var(--fg-2)",
            fontSize: "var(--fs-xs)",
          }}>
            {/* <span style={{ flex: 1, height: 1, background: "var(--border)" }}/> */}
            {/* <span>转发到</span> */}
            {/* <span style={{ flex: 1, height: 1, background: "var(--border)" }}/> */}
          </div>
          <div className="field">
            <label>远端对外端口</label>
            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <Seg value={form.bind_address} onChange={v => set("bind_address", v)} options={[
                { value: "127.0.0.1", label: "仅服务端本机" },
                { value: "0.0.0.0", label: "全部网络" },
              ]}/>
              <input
                className="input mono"
                value={form.local_port || ""}
                onChange={e => set("local_port", e.target.value)}
                type="number"
                min="1" max="65535"
                style={{ width: 120 }}
                required
              />
            </div>
            <span className="help">
              {form.bind_address === "0.0.0.0"
                ? "在 ssh 服务端所有接口上开此端口 — 需要远端 sshd_config 配 GatewayPorts yes/clientspecified，否则仍只在 127.0.0.1 监听"
                : "仅在 ssh 服务端 127.0.0.1 上开此端口，只有服务端本机程序能连接"}
            </span>
          </div>
        </>
      ) : (
        <>
          <div className="field">
            <label>本地</label>
            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <Seg value={form.bind_address} onChange={v => set("bind_address", v)} options={[
                { value: "127.0.0.1", label: "仅本机" },
                { value: "0.0.0.0", label: "全部网络" },
              ]}/>
              <input
                className="input mono"
                value={form.local_port || ""}
                onChange={e => set("local_port", e.target.value)}
                type="number"
                placeholder={form.type === "D" ? "1080" : "5432"}
                min="1" max="65535"
                style={{ width: 120 }}
                required
              />
            </div>
            <span className="help">
              {form.bind_address === "0.0.0.0"
                ? "局域网内其它设备能通过本机 IP 访问这个端口（注意安全）"
                : "只有本机程序能连接（默认推荐）"}
            </span>
          </div>

          {form.type === "L" && (
            <div className="row-2">
              <div className="field">
                <label>远端地址</label>
                <input className="input mono" value={form.remote_host || ""} onChange={e => set("remote_host", e.target.value)} placeholder="db.internal" required/>
              </div>
              <div className="field">
                <label>远端端口</label>
                <input className="input mono" value={form.remote_port || ""} onChange={e => set("remote_port", e.target.value)} type="number" placeholder="5432" min="1" max="65535" required/>
              </div>
            </div>
          )}
        </>
      )}

      <div className="divider"/>
      <ToggleRow label="断线后自动重连" sub="使用默认退避策略，无需配置。" checked={form.keep_alive} onChange={v => set("keep_alive", v)}/>
      <ToggleRow label="应用启动时自动连接" checked={form.auto_start} onChange={v => set("auto_start", v)}/>
    </form>
  );
}

function ToggleRow({ label, sub, checked, onChange }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 16, alignItems: "center", padding: "10px 0" }}>
      <div>
        <div style={{ fontSize: "var(--fs-sm)" }}>{label}</div>
        {sub && <div className="dim-2" style={{ fontSize: "var(--fs-xs)", marginTop: 3 }}>{sub}</div>}
      </div>
      <Toggle checked={checked} onChange={onChange}/>
    </div>
  );
}


// ssh config 隧道导入 — 打开时调 parse_ssh_config_tunnels 拉真实候选。
// 后端 import 时按 (host_id, type, local_port) 去重，主机未在本地 Hosts
// 里的候选会被跳过（前端给出灰色视觉提示）。
function ImportFromSshConfigModal({ open, onClose, onImported, hosts }) {
  const notify = useNotify();
  const [candidates, setCandidates] = React.useState([]);
  const [loading, setLoading] = React.useState(false);
  const [loadError, setLoadError] = React.useState(null);
  const [checked, setChecked] = React.useState(() => new Set());
  const [submitting, setSubmitting] = React.useState(false);

  const aliasToId = React.useMemo(
    () => new Map((hosts || []).map(h => [h.alias, h.id])),
    [hosts]
  );

  React.useEffect(() => {
    if (!open) return;
    setLoading(true);
    setLoadError(null);
    ipc.parseSshConfigTunnels()
      .then(cs => {
        setCandidates(cs);
        // 默认勾选所有"主机已就绪"的候选
        const initial = new Set();
        cs.forEach((c, i) => { if (aliasToId.has(c.host_alias)) initial.add(i); });
        setChecked(initial);
      })
      .catch(e => setLoadError(e.message || String(e)))
      .finally(() => setLoading(false));
  }, [open, aliasToId]);

  const toggle = (idx) => setChecked(prev => {
    const n = new Set(prev);
    n.has(idx) ? n.delete(idx) : n.add(idx);
    return n;
  });
  const allOn = () => setChecked(new Set(
    candidates.map((c, i) => aliasToId.has(c.host_alias) ? i : null).filter(i => i !== null)
  ));
  const allOff = () => setChecked(new Set());
  const importableCount = candidates.filter(c => aliasToId.has(c.host_alias)).length;

  const doImport = async () => {
    const selected = candidates.filter((_, i) => checked.has(i));
    if (selected.length === 0) return;
    setSubmitting(true);
    try {
      await ipc.importTunnels(selected);
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
      width={600}
      title="从 ssh config 导入隧道"
      footer={<>
        {loading
          ? <span className="dim-2" style={{ fontSize: "var(--fs-xs)" }}>解析中…</span>
          : <span className="dim-2" style={{ fontSize: "var(--fs-xs)" }}>
              扫描到 {candidates.length} 条 · 主机已就绪 {importableCount}
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
          ssh config 里没有 LocalForward / RemoteForward / DynamicForward 项
        </div>
      )}
      {!loading && candidates.length > 0 && (
        <>
          <div style={{ display: "flex", gap: 6, marginBottom: 10, alignItems: "center" }}>
            <button className="btn sm ghost" onClick={allOn}>全选</button>
            <button className="btn sm ghost" onClick={allOff}>全不选</button>
            {importableCount < candidates.length && (
              <span className="dim-2" style={{ fontSize: "var(--fs-xs)", marginLeft: 8 }}>
                灰色项对应的主机还没在 Hosts 里
              </span>
            )}
          </div>
          {candidates.map((c, i) => {
            const ready = aliasToId.has(c.host_alias);
            return (
              <label key={i} style={{
                display: "grid", gridTemplateColumns: "auto 26px 1fr auto", gap: 10,
                alignItems: "center", padding: "10px 8px",
                borderBottom: "1px solid var(--border)",
                cursor: "default",
                opacity: ready ? 1 : 0.45,
              }}>
                <input type="checkbox" checked={checked.has(i)} onChange={() => toggle(i)} disabled={!ready}/>
                <span className="mono" style={{
                  display: "inline-grid", placeItems: "center", width: 22, height: 22, borderRadius: 4,
                  fontSize: 10, fontWeight: 700,
                  background: c.type === "L" ? "color-mix(in oklch, var(--info) 18%, var(--bg-2))" : c.type === "R" ? "color-mix(in oklch, var(--accent) 18%, var(--bg-2))" : "color-mix(in oklch, #c084fc 18%, var(--bg-2))",
                  color: c.type === "L" ? "var(--info)" : c.type === "R" ? "var(--accent)" : "#c084fc",
                }}>{c.type}</span>
                <div style={{ minWidth: 0 }}>
                  <div className="mono tr" style={{ fontSize: "var(--fs-sm)" }}>{c.line}</div>
                  <div className="dim-2" style={{ fontSize: "var(--fs-xs)" }}>
                    Host <span className="mono">{c.host_alias}</span>
                  </div>
                </div>
                {ready
                  ? <span style={{ color: "var(--ok)", fontSize: "var(--fs-xs)" }}>就绪</span>
                  : <span className="dim-2" style={{ fontSize: "var(--fs-xs)" }}>主机未导入</span>
                }
              </label>
            );
          })}
        </>
      )}
    </Modal>
  );
}

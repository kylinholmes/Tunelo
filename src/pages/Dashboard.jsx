import React from "react";
import { Icon, StatusDot } from "../components/ui";
import * as ipc from "../lib/ipc";
import { hostById, proxyChain, formatUptime } from "../lib/ipc";
import { useConfirm, useNotify } from "../components/Confirm";

// Dashboard — at-a-glance overview: problems first, then every tunnel,
// with hosts / recent activity / local ports in a side rail.

const RUNNING = ["connected", "connecting", "reconnecting"];

export default function DashboardPage({ tunnels, hosts, onNavigate, onTunnelAction }) {
  const askConfirm = useConfirm();
  const connected = tunnels.filter(t => t.status === "connected");
  const reconnecting = tunnels.filter(t => t.status === "reconnecting");
  const failed = tunnels.filter(t => t.status === "failed");
  const idle = tunnels.filter(t => t.status === "idle");
  const issues = tunnels.filter(t => t.status === "reconnecting" || t.status === "failed");
  const running = tunnels.filter(t => RUNNING.includes(t.status));
  const autoStartable = tunnels.filter(t => t.auto_start && (t.status === "idle" || t.status === "failed"));
  // everything that isn't a problem lives in the main grid: online first,
  // then transitional, then idle
  const gridTunnels = [
    ...connected,
    ...tunnels.filter(t => t.status === "connecting" || t.status === "stopping"),
    ...idle,
  ];

  // uptimes / "3 分钟前" need a clock — re-render every 30s
  const [, tick] = React.useReducer(x => x + 1, 0);
  React.useEffect(() => { const id = setInterval(tick, 30_000); return () => clearInterval(id); }, []);

  const startAuto = async () => {
    for (const t of autoStartable) await onTunnelAction(t.id, "start");
  };
  const stopAll = async () => {
    const ok = await askConfirm({
      title: "停止全部隧道",
      message: `确定停止正在运行的 ${running.length} 条隧道？\n经过它们的连接会立刻断开。`,
      confirmLabel: "全部停止",
      danger: true,
    });
    if (!ok) return;
    for (const t of running) await onTunnelAction(t.id, "stop");
  };

  // 全空场景：显示两步引导，跳过 Hero 数字（数字都是 0 没意义）
  if (hosts.length === 0 && tunnels.length === 0) {
    return (
      <div className="page" style={{ overflow: "auto" }}>
        <div style={{ padding: "48px 36px", maxWidth: 920, margin: "0 auto" }}>
          <Onboarding hosts={hosts} tunnels={tunnels} onNavigate={onNavigate}/>
        </div>
      </div>
    );
  }

  return (
    <div className="page" style={{ overflow: "auto" }}>
      <div className="dash">
        <Hero
          connected={connected.length} reconnecting={reconnecting.length}
          failed={failed.length} idle={idle.length} total={tunnels.length}
          actions={
            <>
              <button className="btn" onClick={startAuto} disabled={autoStartable.length === 0} title="启动标记了「应用启动时自动连接」且当前未运行的隧道">
                <Icon name="play" size={11}/> 启动自动连接的{autoStartable.length > 0 && <span className="mono dim">({autoStartable.length})</span>}
              </button>
              <button className="btn" onClick={stopAll} disabled={running.length === 0}>
                <Icon name="stop" size={11}/> 全部停止
              </button>
              <button className="btn primary" onClick={() => onNavigate("tunnels", { create: true })}>
                <Icon name="plus" size={12}/> 新建隧道
              </button>
            </>
          }
        />

        {/* 只有主机没隧道时，引导用户建第一条隧道 */}
        {tunnels.length === 0 && (
          <div style={{ maxWidth: 920, marginBottom: 32 }}>
            <Onboarding hosts={hosts} tunnels={tunnels} onNavigate={onNavigate}/>
          </div>
        )}

        <div className="dash-cols">
          <div className="dash-main">
            {issues.length > 0 && (
              <Section
                title="需要关注"
                subtitle={`${issues.length} 条隧道当前没在好好工作`}
                tone="warn"
              >
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {issues.map(t => (
                    <IssueCard
                      key={t.id}
                      tunnel={t}
                      host={hostById(t.host_id, hosts)}
                      hosts={hosts}
                      onAction={(a) => onTunnelAction(t.id, a)}
                      onOpen={() => onNavigate("tunnels", { focus: t.id })}
                    />
                  ))}
                </div>
              </Section>
            )}

            {gridTunnels.length > 0 && (
              <Section
                title="隧道"
                subtitle={[
                  connected.length > 0 && `${connected.length} 条在线`,
                  idle.length > 0 && `${idle.length} 条未启动`,
                ].filter(Boolean).join(" · ") || `${gridTunnels.length} 条`}
                action={
                  <button className="btn ghost" onClick={() => onNavigate("tunnels")}>
                    在 Tunnels 中管理 <Icon name="arrow-right" size={11}/>
                  </button>
                }
              >
                <div className="dash-grid">
                  {gridTunnels.map(t => (
                    <TunnelCard
                      key={t.id}
                      tunnel={t}
                      host={hostById(t.host_id, hosts)}
                      hosts={hosts}
                      onAction={(a) => onTunnelAction(t.id, a)}
                      onOpen={() => onNavigate("tunnels", { focus: t.id })}
                    />
                  ))}
                </div>
              </Section>
            )}
          </div>

          <aside className="dash-side">
            <HostsPanel hosts={hosts} tunnels={tunnels} onNavigate={onNavigate}/>
            <RecentPanel tunnels={tunnels} hosts={hosts} onNavigate={onNavigate}/>
            <PortsPanel tunnels={tunnels} onNavigate={onNavigate}/>
          </aside>
        </div>
      </div>
    </div>
  );
}

// ─── hero + quick actions ───

function Hero({ connected, reconnecting, failed, idle, total, actions }) {
  const segs = [
    { v: connected, color: "var(--ok)" },
    { v: reconnecting, color: "var(--warn)" },
    { v: failed, color: "var(--fail)" },
    { v: idle, color: "var(--border-2)" },
  ];
  const sum = total || 1;
  const issues = reconnecting + failed;

  let numberColor = "var(--fg-3)";
  const parts = [];
  if (total === 0) {
    parts.push("暂无隧道");
  } else {
    parts.push("条隧道在线");
    if (reconnecting) parts.push(`${reconnecting} 条重连中`);
    if (failed) parts.push(`${failed} 条失败`);
    if (idle) parts.push(`${idle} 条未启动`);
    numberColor = issues > 0 ? "var(--warn)" : connected > 0 ? "var(--ok)" : "var(--fg-3)";
  }

  return (
    <div className="dash-hero">
      <div className="dash-hero-row">
        <div className="mono" style={{ fontSize: 40, fontWeight: 600, letterSpacing: "-0.03em", lineHeight: 1, color: numberColor }}>
          {connected}<span className="dim-2" style={{ fontWeight: 400, fontSize: 26 }}>/{total}</span>
        </div>
        <div style={{ fontSize: "var(--fs-md)", color: "var(--fg-1)", paddingBottom: 3 }}>
          {parts.join(" · ")}
        </div>
        <div style={{ flex: 1 }}/>
        <div className="dash-actions">{actions}</div>
      </div>

      {total > 0 && (
        <div style={{ display: "flex", height: 5, overflow: "hidden", background: "var(--bg-2)", margin: "14px 0 8px" }}>
          {segs.map((s, i) => s.v > 0 && (
            <div key={i} style={{ flex: s.v / sum, background: s.color, transition: "flex .2s" }}/>
          ))}
        </div>
      )}

      <div style={{ display: "flex", gap: 18, fontSize: "var(--fs-xs)", color: "var(--fg-2)", flexWrap: "wrap" }}>
        <Legend dotColor="var(--ok)" label="在线" value={connected}/>
        <Legend dotColor="var(--warn)" label="重连中" value={reconnecting}/>
        <Legend dotColor="var(--fail)" label="失败" value={failed}/>
        <Legend dotColor="var(--border-2)" label="未启动" value={idle}/>
      </div>
    </div>
  );
}

function Legend({ dotColor, label, value }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      <span style={{ width: 7, height: 7, borderRadius: "50%", background: dotColor }}/>
      <span>{label}</span>
      <span className="mono" style={{ color: "var(--fg)" }}>{value}</span>
    </span>
  );
}

function Section({ title, subtitle, action, tone, children }) {
  return (
    <div style={{ marginBottom: 30 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: "var(--fs-md)", fontWeight: 600, color: tone === "warn" ? "var(--warn)" : "var(--fg)" }}>{title}</div>
          {subtitle && <div className="dim-2" style={{ fontSize: "var(--fs-xs)", marginTop: 2 }}>{subtitle}</div>}
        </div>
        <div style={{ flex: 1 }}/>
        {action}
      </div>
      {children}
    </div>
  );
}

// ─── shared bits ───

function TypeBadge({ type }) {
  const color = type === "L" ? "var(--info)" : type === "R" ? "var(--accent)" : "var(--purple)";
  return (
    <span className="mono" style={{
      display: "inline-grid", placeItems: "center",
      width: 20, height: 20, borderRadius: 4,
      background: `color-mix(in oklch, ${color} 18%, var(--bg-2))`,
      color, fontSize: 10, fontWeight: 700, flexShrink: 0,
    }}>{type}</span>
  );
}

// "localhost:5432 → 10.0.0.8:5432" with the port the user actually types
// made prominent.
function RouteText({ tunnel, emphasize }) {
  const port = <span style={{ color: emphasize ? "var(--fg)" : undefined, fontWeight: emphasize ? 600 : undefined }}>{tunnel.local_port}</span>;
  const arrow = <span className="dim-2"> → </span>;
  if (tunnel.type === "D") return <><span className="dim-2">SOCKS5 </span>localhost:{port}</>;
  if (tunnel.type === "R") return <><span className="dim-2">远端 </span>:{port}{arrow}{tunnel.remote_host}:{tunnel.remote_port}</>;
  return <>localhost:{port}{arrow}{tunnel.remote_host}:{tunnel.remote_port}</>;
}

// "经 prod-db 42ms · jump → prod-db"
function HostLine({ host, hosts }) {
  if (!host) return <span className="dim-2">主机已删除</span>;
  const chain = proxyChain(host, hosts);
  return (
    <span className="tr" style={{ display: "inline-flex", alignItems: "center", gap: 6, minWidth: 0 }}>
      <span className="dim-2">经</span>
      <span style={{ color: "var(--fg-1)" }}>{host.alias}</span>
      <HostHealth host={host}/>
      {chain.length > 1 && (
        <span className="dim-2 tr" title={chain.map(h => h.alias).join(" → ")}>{chain.map(h => h.alias).join(" → ")}</span>
      )}
    </span>
  );
}

function HostHealth({ host }) {
  if (host.status === "ok") return <span className="mono" style={{ color: "var(--ok)" }}>{host.last_latency_ms != null ? `${host.last_latency_ms}ms` : "通"}</span>;
  if (host.status === "fail") return <span className="mono" style={{ color: "var(--fail)" }} title={host.last_error || ""}>不通</span>;
  if (host.status === "checking") return <span className="mono dim-2">测试中…</span>;
  return null;
}

function localAddr(t) {
  const bind = !t.bind_address || t.bind_address === "0.0.0.0" ? "localhost" : t.bind_address;
  return `${bind}:${t.local_port}`;
}

// copy-to-clipboard icon that flips to a check for a moment
function CopyButton({ text, title }) {
  const notify = useNotify();
  const [done, setDone] = React.useState(false);
  const copy = async (e) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(text);
      setDone(true);
      setTimeout(() => setDone(false), 1400);
    } catch {
      notify({ title: "复制失败", message: "当前环境不允许访问剪贴板，请手动复制：" + text, kind: "error" });
    }
  };
  return (
    <button className="iconbtn dash-ico" onClick={copy} title={title || `复制 ${text}`} style={done ? { color: "var(--ok)" } : null}>
      <Icon name={done ? "check" : "copy"} size={12}/>
    </button>
  );
}

function fmtClock(ms) {
  const d = new Date(ms), now = new Date();
  const hm = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  if (d.toDateString() === now.toDateString()) return hm;
  const y = new Date(now); y.setDate(now.getDate() - 1);
  if (d.toDateString() === y.toDateString()) return `昨天 ${hm}`;
  return `${d.getMonth() + 1}-${String(d.getDate()).padStart(2, "0")} ${hm}`;
}
function fmtAgo(ms) {
  const s = Math.max(0, Math.floor((Date.now() - ms) / 1000));
  if (s < 60) return "刚刚";
  if (s < 3600) return `${Math.floor(s / 60)} 分钟前`;
  if (s < 86400) return `${Math.floor(s / 3600)} 小时前`;
  return `${Math.floor(s / 86400)} 天前`;
}

// ─── cards ───

function IssueCard({ tunnel, host, hosts, onAction, onOpen }) {
  const isFail = tunnel.status === "failed";
  const wasUp = tunnel.last_connected_at && tunnel.disconnected_at && tunnel.disconnected_at > tunnel.last_connected_at;
  return (
    <div className="dash-issue" data-tone={isFail ? "fail" : "warn"} onClick={onOpen}>
      <div className="dash-row">
        <StatusDot status={tunnel.status}/>
        <TypeBadge type={tunnel.type}/>
        <span style={{ fontWeight: 600 }}>{tunnel.name}</span>
        <span className="mono dim-2 tr" style={{ fontSize: "var(--fs-xs)", minWidth: 0 }}><RouteText tunnel={tunnel}/></span>
        <div style={{ flex: 1 }}/>
        <span className={`spill ${isFail ? "fail" : "warn"}`}>
          {isFail ? "失败" : tunnel.reconnect_count > 0 ? `重连中 · 第 ${tunnel.reconnect_count} 次` : "重连中"}
        </span>
        <button className="btn sm" onClick={(e) => { e.stopPropagation(); onAction("restart"); }}>
          <Icon name="restart" size={11}/> 重启
        </button>
        {!isFail && (
          <button className="btn sm ghost" onClick={(e) => { e.stopPropagation(); onAction("stop"); }}>
            <Icon name="stop" size={11}/> 停止
          </button>
        )}
      </div>
      {tunnel.last_error && (
        <div className="mono tr" style={{ fontSize: "var(--fs-xs)", color: isFail ? "var(--fail)" : "var(--warn)", marginTop: 4 }} title={tunnel.last_error}>
          <Icon name="warn" size={10} style={{ verticalAlign: "-1px", marginRight: 4 }}/>{tunnel.last_error}
        </div>
      )}
      <div className="dash-kv">
        <HostLine host={host} hosts={hosts}/>
        {wasUp && (
          <span className="dim-2">
            上次在线 <b className="mono">{fmtClock(tunnel.last_connected_at)}</b>，持续 <b className="mono">{formatUptime(Math.floor((tunnel.disconnected_at - tunnel.last_connected_at) / 1000))}</b>
          </span>
        )}
        {tunnel.disconnected_at && (
          <span className="dim-2">断开于 <b className="mono">{fmtAgo(tunnel.disconnected_at)}</b></span>
        )}
      </div>
    </div>
  );
}

function TunnelCard({ tunnel, host, hosts, onAction, onOpen }) {
  const st = tunnel.status;
  const isIdle = st === "idle";
  const upSec = tunnel.started_at ? Math.floor((Date.now() - tunnel.started_at) / 1000) : 0;
  const uptime = !tunnel.started_at ? null : upSec < 60 ? "刚连上" : formatUptime(upSec);
  return (
    <div className="dash-card" data-idle={isIdle || undefined} onClick={onOpen}>
      <div className="dash-row">
        <TypeBadge type={tunnel.type}/>
        <span className="tr" style={{ fontWeight: 500, color: isIdle ? "var(--fg-2)" : "var(--fg)", minWidth: 0 }}>{tunnel.name}</span>
        <div style={{ flex: 1 }}/>
        {st === "connected" && <span className="spill ok"><span className="dot ok"/>{uptime || "在线"}</span>}
        {st === "connecting" && <span className="spill info"><span className="dot info"/>连接中</span>}
        {st === "stopping" && <span className="spill"><span className="dot idle"/>停止中</span>}
        {isIdle && <span className="spill">未启动</span>}
      </div>
      <div className="mono dim" style={{ fontSize: "var(--fs-xs)", paddingLeft: 28, marginTop: 2 }}>
        <RouteText tunnel={tunnel} emphasize={st === "connected"}/>
      </div>
      <div className="dash-kv" style={{ paddingLeft: 28 }}>
        <HostLine host={host} hosts={hosts}/>
        <div style={{ flex: 1 }}/>
        {st === "connected" && (
          <span className="dash-card-actions">
            <CopyButton text={localAddr(tunnel)}/>
            <button className="iconbtn dash-ico" title="停止" onClick={(e) => { e.stopPropagation(); onAction("stop"); }}><Icon name="stop" size={12}/></button>
          </span>
        )}
        {isIdle && (
          <button className="btn sm primary" onClick={(e) => { e.stopPropagation(); onAction("start"); }}>
            <Icon name="play" size={11}/> 启动
          </button>
        )}
      </div>
    </div>
  );
}

// ─── side rail ───

function AsidePanel({ title, count, action, children }) {
  return (
    <div className="dash-panel">
      <div className="dash-panel-h">
        <span style={{ fontWeight: 600, fontSize: "var(--fs-sm)" }}>{title}</span>
        {count != null && <span className="dim-2 mono" style={{ fontSize: "var(--fs-xs)" }}>{count}</span>}
        <div style={{ flex: 1 }}/>
        {action}
      </div>
      {children}
    </div>
  );
}

function HostsPanel({ hosts, tunnels, onNavigate }) {
  const [testing, setTesting] = React.useState(false);
  const testAll = async () => {
    setTesting(true);
    try {
      const ids = hosts.map(h => h.id);
      for (let i = 0; i < ids.length; i += 5) {
        await Promise.all(ids.slice(i, i + 5).map(id => ipc.testHost(id, false).catch(() => {})));
      }
    } finally { setTesting(false); }
  };
  const jumpFor = new Set(hosts.map(h => h.proxy_jump).filter(Boolean));
  return (
    <AsidePanel
      title="主机" count={hosts.length}
      action={
        <button className="btn ghost sm" onClick={testAll} disabled={testing || hosts.length === 0}>
          <Icon name={testing ? "sync" : "test"} size={11} className={testing ? "spin" : undefined}/> 测试全部
        </button>
      }
    >
      {hosts.length === 0 && <div className="dash-empty">还没有主机</div>}
      {hosts.map(h => {
        const n = tunnels.filter(t => t.host_id === h.id).length;
        const via = h.proxy_jump ? hostById(h.proxy_jump, hosts)?.alias : null;
        return (
          <button key={h.id} className="dash-host" onClick={() => onNavigate("hosts")} title={h.last_error || `${h.user}@${h.hostname}:${h.port}`}>
            <StatusDot status={h.status}/>
            <div style={{ minWidth: 0 }}>
              <div className="tr"><span style={{ color: "var(--fg)" }}>{h.alias}</span> <span className="dim-2 mono" style={{ fontSize: "var(--fs-xs)" }}>{h.hostname}</span></div>
              <div className="dim-2 tr" style={{ fontSize: "var(--fs-xs)" }}>
                {h.status === "fail" && h.last_error
                  ? <span style={{ color: "var(--fail)" }}>{h.last_error}</span>
                  : [`${n} 条隧道`, jumpFor.has(h.id) && "跳板", via && `经 ${via}`].filter(Boolean).join(" · ")}
              </div>
            </div>
            <span className="mono dim" style={{ fontSize: "var(--fs-xs)" }}>
              {h.status === "checking" ? "…" : h.status === "ok" && h.last_latency_ms != null ? `${h.last_latency_ms} ms` : h.status === "fail" ? "—" : ""}
            </span>
          </button>
        );
      })}
    </AsidePanel>
  );
}

// Recent activity: seeded from the backend's ring buffer, then appended live.
function RecentPanel({ tunnels, hosts, onNavigate }) {
  const [events, setEvents] = React.useState(null);
  React.useEffect(() => {
    let cancelled = false;
    ipc.listEvents(40).then(list => { if (!cancelled) setEvents(list); }).catch(() => { if (!cancelled) setEvents([]); });
    const off = ipc.onNewEvent(ev => setEvents(list => [ev, ...(list || [])].slice(0, 40)));
    return () => { cancelled = true; off(); };
  }, []);

  const [expanded, setExpanded] = React.useState(false);
  const shown = expanded ? (events || []) : (events || []).slice(0, 8);

  return (
    <AsidePanel
      title="最近"
      action={events && events.length > 8 && (
        <button className="btn ghost sm" onClick={() => setExpanded(e => !e)}>{expanded ? "收起" : `全部 ${events.length} 条`}</button>
      )}
    >
      {events === null && <div className="dash-empty">加载中…</div>}
      {events && events.length === 0 && <div className="dash-empty">还没有记录 — 隧道连接、断开、重连和主机测试结果会出现在这里</div>}
      {shown.map(ev => <EventRow key={ev.id} ev={ev} onNavigate={onNavigate}/>)}
    </AsidePanel>
  );
}

function EventRow({ ev, onNavigate }) {
  let color = "var(--fg-1)", text = ev.status, detail = ev.detail;
  if (ev.kind === "tunnel") {
    if (ev.status === "connected") { color = "var(--ok)"; text = "已连接"; }
    else if (ev.status === "reconnecting") { color = "var(--warn)"; text = ev.attempt > 1 ? `重连（第 ${ev.attempt} 次）` : "断开，重连中"; }
    else if (ev.status === "failed") { color = "var(--fail)"; text = "失败"; }
    else if (ev.status === "stopped") { color = "var(--fg-2)"; text = "已停止"; detail = null; }
  } else {
    if (ev.status === "ok") { color = "var(--ok)"; text = `连通 ${ev.detail || ""}`.trim(); detail = null; }
    else { color = "var(--fail)"; text = "连通性测试失败"; }
  }
  const go = () => onNavigate(ev.kind === "tunnel" ? "tunnels" : "hosts", ev.kind === "tunnel" ? { focus: ev.subject_id } : undefined);
  return (
    <button className="dash-ev" onClick={go} title={detail || ""}>
      <span className="mono dim-2" style={{ fontSize: "var(--fs-xs)", whiteSpace: "nowrap" }}>{fmtClock(ev.at)}</span>
      <span className="tr" style={{ minWidth: 0 }}>
        <span style={{ color, fontWeight: 500 }}>{ev.subject}</span>
        <span className="dim"> {text}</span>
        {detail && <span className="dim-2 mono" style={{ fontSize: "var(--fs-xs)" }}> {detail}</span>}
      </span>
    </button>
  );
}

function PortsPanel({ tunnels, onNavigate }) {
  const sorted = [...tunnels].sort((a, b) => a.local_port - b.local_port);
  return (
    <AsidePanel title="本地端口" count={sorted.length || null}>
      {sorted.length === 0 && <div className="dash-empty">还没有隧道</div>}
      <div className="dash-ports">
        {sorted.map(t => {
          const tone = t.status === "connected" ? "on" : t.status === "reconnecting" || t.status === "failed" ? "warn" : "off";
          return (
            <button key={t.id} className="dash-port" data-tone={tone} onClick={() => onNavigate("tunnels", { focus: t.id })}
              title={t.type === "R" ? `远端 ${t.local_port} → 本机 ${t.remote_host}:${t.remote_port}` : localAddr(t)}>
              {t.local_port} <span className="dim-2">{t.name}{t.type === "R" ? " · 远端" : ""}</span>
            </button>
          );
        })}
      </div>
    </AsidePanel>
  );
}

// 两步引导：①添加主机 → ②创建隧道
function Onboarding({ hosts, tunnels, onNavigate }) {
  const step1Done = hosts.length > 0;
  const step2Done = tunnels.length > 0;
  // 当前激活步骤：step1 未完则 step1，否则 step2
  const activeStep = step1Done ? 2 : 1;

  return (
    <div>
      <div style={{ marginBottom: 28, textAlign: "center" }}>
        <div style={{ fontSize: 22, fontWeight: 600, letterSpacing: "-0.02em", marginBottom: 6 }}>
          开始使用 Tunelo
        </div>
        <div className="dim" style={{ fontSize: "var(--fs-md)" }}>
          两步把远端服务的端口映射到本地
        </div>
      </div>

      <div style={{
        display: "grid",
        gridTemplateColumns: "1fr auto 1fr",
        gap: 14,
        alignItems: "stretch",
      }}>
        <StepCard
          n={1}
          done={step1Done}
          active={activeStep === 1}
          icon="host"
          title="添加主机"
          desc="远端 SSH 服务器：跳板机、目标主机等"
          primary={{ label: "新建", icon: "plus", onClick: () => onNavigate("hosts", { create: true }) }}
          secondary={{ label: "从 ssh config 导入", icon: "import", onClick: () => onNavigate("hosts", { import: true }) }}
        />

        <StepArrow active={activeStep === 2}/>

        <StepCard
          n={2}
          done={step2Done}
          active={activeStep === 2}
          icon="tunnel"
          title="创建隧道"
          desc="端口转发规则：本地端口 → 远端服务"
          primary={{ label: "新建", icon: "plus", onClick: () => onNavigate("tunnels", { create: true }), disabled: !step1Done }}
          secondary={{ label: "从 ssh config 导入", icon: "import", onClick: () => onNavigate("tunnels", { import: true }), disabled: !step1Done }}
        />
      </div>

      {!step1Done && (
        <div className="dim-2" style={{ fontSize: "var(--fs-xs)", textAlign: "center", marginTop: 16 }}>
          隧道必须经过一台主机，所以从添加主机开始
        </div>
      )}
    </div>
  );
}

function StepCard({ n, done, active, icon, title, desc, primary, secondary }) {
  return (
    <div style={{
      border: active
        ? "1px solid var(--accent-line)"
        : "1px solid var(--border)",
      borderRadius: "var(--radius-lg)",
      background: active
        ? "color-mix(in oklch, var(--accent) 4%, var(--bg-1))"
        : "var(--bg-1)",
      padding: "20px 22px",
      display: "flex",
      flexDirection: "column",
      gap: 14,
      opacity: !active && !done ? 0.7 : 1,
      transition: "background .15s, border-color .15s",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{
          width: 32, height: 32, borderRadius: "50%",
          display: "grid", placeItems: "center",
          background: done
            ? "var(--accent)"
            : active
              ? "color-mix(in oklch, var(--accent) 22%, var(--bg-2))"
              : "var(--bg-2)",
          color: done ? "var(--on-accent)" : active ? "var(--accent)" : "var(--fg-3)",
          fontWeight: 700, fontSize: 14,
          fontFamily: "var(--mono)",
          flexShrink: 0,
        }}>
          {done ? <Icon name="check" size={14}/> : n}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Icon name={icon} size={14} style={{ color: active ? "var(--accent)" : "var(--fg-3)" }}/>
            <span style={{ fontWeight: 600, fontSize: "var(--fs-md)" }}>{title}</span>
          </div>
          <div className="dim-2" style={{ fontSize: "var(--fs-xs)", marginTop: 2 }}>{desc}</div>
        </div>
      </div>

      <div style={{ display: "flex", gap: 8 }}>
        <button
          className={active ? "btn primary" : "btn"}
          disabled={primary.disabled}
          onClick={primary.onClick}
          style={{ flex: 1, justifyContent: "center" }}
        >
          <Icon name={primary.icon} size={12}/> {primary.label}
        </button>
        <button
          className="btn"
          disabled={secondary.disabled}
          onClick={secondary.onClick}
          style={{ flex: 1, justifyContent: "center" }}
        >
          <Icon name={secondary.icon} size={12}/> {secondary.label}
        </button>
      </div>
    </div>
  );
}

function StepArrow({ active }) {
  return (
    <div style={{
      display: "grid", placeItems: "center",
      color: active ? "var(--accent)" : "var(--fg-3)",
      padding: "0 4px",
    }}>
      <Icon name="arrow-right" size={20}/>
    </div>
  );
}

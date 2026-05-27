import React from "react";
import { Icon, StatusDot } from "../components/ui";
import { hostById, formatUptime } from "../lib/data";

// Dashboard — at-a-glance overview. The home page when you have many tunnels.

export default function DashboardPage({ tunnels, hosts, onNavigate, onTunnelAction }) {
  const connected = tunnels.filter(t => t.status === "connected");
  const issues = tunnels.filter(t => ["failed", "reconnecting"].includes(t.status));
  const idle = tunnels.filter(t => t.status === "idle");
  const total = tunnels.length;

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
      <div style={{ padding: "32px 36px", maxWidth: 920, margin: "0 auto" }}>
        <Hero connected={connected.length} issues={issues.length} idle={idle.length} total={total}/>

        {/* 只有主机没隧道时，引导用户建第一条隧道 */}
        {tunnels.length === 0 && (
          <Onboarding hosts={hosts} tunnels={tunnels} onNavigate={onNavigate}/>
        )}

        {issues.length > 0 && (
          <Section
            title="需要关注"
            subtitle={`${issues.length} 条隧道当前没在好好工作`}
            tone="warn"
          >
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {issues.map(t => (
                <IssueRow
                  key={t.id}
                  tunnel={t}
                  host={hostById(t.host_id, hosts)}
                  onAction={(a) => onTunnelAction(t.id, a)}
                  onOpen={() => onNavigate("tunnels", { focus: t.id })}
                />
              ))}
            </div>
          </Section>
        )}

        {connected.length > 0 && (
          <Section
            title="在线"
            subtitle={`${connected.length} 条隧道正在运行`}
            action={
              <button className="btn ghost" onClick={() => onNavigate("tunnels")}>
                在 Tunnels 中管理 <Icon name="arrow-right" size={11}/>
              </button>
            }
          >
            <div style={{
              display: "grid",
              gridTemplateColumns: "repeat(2, 1fr)",
              gap: 10,
            }}>
              {connected.map(t => (
                <OnlineRow
                  key={t.id}
                  tunnel={t}
                  host={hostById(t.host_id, hosts)}
                  onOpen={() => onNavigate("tunnels", { focus: t.id })}
                />
              ))}
            </div>
          </Section>
        )}

        {/* 全部未启动时给一个明显的启动入口，避免下方大块空白 */}
        {tunnels.length > 0 && connected.length === 0 && issues.length === 0 && (
          <Section
            title="未启动"
            subtitle={`${idle.length} 条隧道空闲中，点启动即可拉起`}
            action={
              <button className="btn ghost" onClick={() => onNavigate("tunnels")}>
                在 Tunnels 中管理 <Icon name="arrow-right" size={11}/>
              </button>
            }
          >
            <div style={{
              display: "grid",
              gridTemplateColumns: "repeat(2, 1fr)",
              gap: 10,
            }}>
              {idle.map(t => (
                <IdleRow
                  key={t.id}
                  tunnel={t}
                  host={hostById(t.host_id, hosts)}
                  onStart={() => onTunnelAction(t.id, "start")}
                  onOpen={() => onNavigate("tunnels", { focus: t.id })}
                />
              ))}
            </div>
          </Section>
        )}

      </div>
    </div>
  );
}

function IdleRow({ tunnel, host, onStart, onOpen }) {
  const typeColor = tunnel.type === "L" ? "var(--info)"
    : tunnel.type === "R" ? "var(--accent)"
    : "#c084fc";
  const typeBg = tunnel.type === "L" ? "color-mix(in oklch, var(--info) 18%, var(--bg-2))"
    : tunnel.type === "R" ? "color-mix(in oklch, var(--accent) 18%, var(--bg-2))"
    : "color-mix(in oklch, #c084fc 18%, var(--bg-2))";
  return (
    <div
      style={{
        border: "1px solid var(--border)",
        background: "var(--bg-1)",
        padding: "12px 14px",
        display: "flex",
        flexDirection: "column",
        gap: 4,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span className="mono" style={{
          display: "inline-grid", placeItems: "center",
          width: 20, height: 20,
          background: typeBg, color: typeColor,
          fontSize: 10, fontWeight: 700, flexShrink: 0,
        }}>{tunnel.type}</span>
        <button
          onClick={onOpen}
          style={{
            background: "transparent", border: 0, padding: 0,
            fontWeight: 500, fontSize: "var(--fs-sm)",
            color: "var(--fg)", textAlign: "left",
            flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            cursor: "default",
          }}
        >{tunnel.name}</button>
        <button
          className="btn sm"
          onClick={onStart}
          style={{
            background: "var(--accent)",
            color: "#07120c",
            borderColor: "var(--accent)",
            fontWeight: 700,
          }}
        >
          <Icon name="play" size={11}/> 启动
        </button>
      </div>
      <div className="mono dim" style={{ fontSize: "var(--fs-xs)", paddingLeft: 28 }}>
        {tunnel.type === "D" ? `:${tunnel.local_port}` : `:${tunnel.local_port} → ${tunnel.remote_host}:${tunnel.remote_port}`}
        <span className="dim-2"> · {host?.alias}</span>
      </div>
    </div>
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
          color: done ? "#07120c" : active ? "var(--accent)" : "var(--fg-3)",
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

function Hero({ connected, issues, idle, total }) {
  const segs = [
    { v: connected, color: "var(--accent)" },
    { v: issues, color: "var(--fail)" },
    { v: idle, color: "var(--border-2)" },
  ];
  const sum = total || 1;

  // colour + label depend on the actual mix of connected / issues / idle
  let numberColor = "var(--fg-3)";
  let label = "暂无隧道";
  if (total > 0) {
    if (issues > 0) {
      numberColor = "var(--warn)";
      label = `条隧道在线 · ${issues} 条有问题`;
    } else if (connected === 0) {
      // total > 0 but nothing running — neutral grey, not green
      numberColor = "var(--fg-3)";
      label = "条隧道全部未启动";
    } else if (connected === total) {
      numberColor = "var(--accent)";
      label = "条隧道全部在线";
    } else {
      numberColor = "var(--accent)";
      label = "条隧道在线";
    }
  }

  return (
    <div style={{ marginBottom: 36 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 14, marginBottom: 18 }}>
        <div style={{ fontSize: 44, fontWeight: 600, letterSpacing: "-0.03em", lineHeight: 1, fontFamily: "var(--mono)", color: numberColor }}>
          {connected}<span className="dim-2" style={{ fontWeight: 400 }}>/{total}</span>
        </div>
        <div style={{ fontSize: "var(--fs-md)", color: "var(--fg-2)", paddingBottom: 4 }}>
          {label}
        </div>
      </div>

      {total > 0 && (
        <div style={{ display: "flex", height: 6, borderRadius: 3, overflow: "hidden", background: "var(--bg-2)", marginBottom: 12 }}>
          {segs.map((s, i) => s.v > 0 && (
            <div key={i} style={{ flex: s.v / sum, background: s.color, transition: "flex .2s" }}/>
          ))}
        </div>
      )}

      <div style={{ display: "flex", gap: 22, fontSize: "var(--fs-sm)", color: "var(--fg-2)" }}>
        <Legend dotColor="var(--accent)" label="在线" value={connected}/>
        <Legend dotColor="var(--fail)" label="有问题" value={issues}/>
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
    <div style={{ marginBottom: 36 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
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

function IssueRow({ tunnel, host, onAction, onOpen }) {
  return (
    <div
      onClick={onOpen}
      style={{
        border: "1px solid color-mix(in oklch, var(--fail) 30%, var(--border))",
        borderLeft: "3px solid var(--fail)",
        borderRadius: "var(--radius-lg)",
        background: "color-mix(in oklch, var(--fail) 4%, var(--bg-1))",
        padding: "14px 18px",
        display: "grid",
        gridTemplateColumns: "1fr auto",
        gap: 14,
        alignItems: "center",
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
          <StatusDot status={tunnel.status}/>
          <span style={{ fontWeight: 600 }}>{tunnel.name}</span>
          <span className="mono dim-2" style={{ fontSize: "var(--fs-xs)" }}>
            {tunnel.type === "D" ? `SOCKS5 :${tunnel.local_port}` : `:${tunnel.local_port} → ${tunnel.remote_host}:${tunnel.remote_port}`}
          </span>
          <span className="dim-2" style={{ fontSize: "var(--fs-xs)" }}>· 经 {host?.alias}</span>
        </div>
        {tunnel.last_error && (
          <div className="mono tr" style={{ fontSize: "var(--fs-xs)", color: "var(--fail)" }} title={tunnel.last_error}>
            <Icon name="warn" size={10} style={{ verticalAlign: "-1px", marginRight: 4 }}/>{tunnel.last_error}
          </div>
        )}
      </div>
      <div style={{ display: "flex", gap: 6 }}>
        <button className="btn sm" onClick={(e) => { e.stopPropagation(); onAction("restart"); }}>
          <Icon name="restart" size={11}/> 重启
        </button>
      </div>
    </div>
  );
}

function OnlineRow({ tunnel, host, onOpen }) {
  return (
    <button
      onClick={onOpen}
      style={{
        textAlign: "left",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-lg)",
        background: "var(--bg-1)",
        padding: "12px 14px",
        display: "flex",
        flexDirection: "column",
        gap: 4,
        cursor: "default",
      }}
      onMouseEnter={e => { e.currentTarget.style.background = "var(--bg-2)"; }}
      onMouseLeave={e => { e.currentTarget.style.background = "var(--bg-1)"; }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span className="mono" style={{
          display: "inline-grid", placeItems: "center",
          width: 20, height: 20, borderRadius: 4,
          background: tunnel.type === "L" ? "color-mix(in oklch, var(--info) 18%, var(--bg-2))" : tunnel.type === "R" ? "color-mix(in oklch, var(--accent) 18%, var(--bg-2))" : "color-mix(in oklch, #c084fc 18%, var(--bg-2))",
          color: tunnel.type === "L" ? "var(--info)" : tunnel.type === "R" ? "var(--accent)" : "#c084fc",
          fontSize: 10, fontWeight: 700, flexShrink: 0,
        }}>{tunnel.type}</span>
        <span style={{ fontWeight: 500 }}>{tunnel.name}</span>
        <div style={{ flex: 1 }}/>
        <span className="mono dim-2" style={{ fontSize: "var(--fs-xs)" }}>
          {tunnel.started_at ? formatUptime(Math.floor((Date.now() - tunnel.started_at) / 1000)) : "—"}
        </span>
      </div>
      <div className="mono dim" style={{ fontSize: "var(--fs-xs)", paddingLeft: 28 }}>
        {tunnel.type === "D" ? `:${tunnel.local_port}` : `:${tunnel.local_port} → ${tunnel.remote_host}:${tunnel.remote_port}`}
        <span className="dim-2"> · {host?.alias}</span>
      </div>
    </button>
  );
}

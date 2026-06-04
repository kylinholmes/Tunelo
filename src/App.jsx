import React from "react";
import { useTweaks } from "./lib/useTweaks";
import * as ipc from "./lib/ipc";
import { Icon } from "./components/ui";
import { ConfirmProvider, useConfirm, useNotify } from "./components/Confirm";
import DashboardPage from "./pages/Dashboard";
import TunnelsPage from "./pages/Tunnels";
import HostsPage from "./pages/Hosts";
import SettingsPage from "./pages/Settings";

const TWEAK_DEFAULTS = {
  theme: "dark",
  accent: "#58e2a3",
  nav: "side",
  railExpanded: false,
  radius: "sharp",
};

const NAV_ITEMS = [
  { id: "dashboard", icon: "dashboard", label: "总览" },
  { id: "tunnels", icon: "tunnel", label: "Tunnels" },
  { id: "hosts", icon: "host", label: "Hosts" },
  { id: "settings", icon: "setting", label: "Settings" },
];

export default function App() {
  return (
    <ConfirmProvider>
      <AppInner/>
    </ConfirmProvider>
  );
}

// Web-mode token login. Shown only when the backend requires a bearer token and
// we don't have a valid one yet. Self-contained inline styles since it renders
// outside the themed `.app` container.
function TokenGate({ checking, onSubmit }) {
  const [token, setToken] = React.useState("");
  const [err, setErr] = React.useState(false);
  const [busy, setBusy] = React.useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!token.trim() || busy) return;
    setBusy(true);
    setErr(false);
    const ok = await onSubmit(token.trim());
    setBusy(false);
    if (!ok) setErr(true);
  };

  const disabled = checking || busy || !token.trim();
  return (
    <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "#0c0f0d", color: "#e8efe9", fontFamily: "system-ui, sans-serif" }}>
      <form onSubmit={submit} style={{ width: 340, padding: 28, border: "1px solid #243029", borderRadius: 10 }}>
        <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}>Tunelo</div>
        <div style={{ fontSize: 13, color: "#8aa094", marginBottom: 18 }}>
          {checking ? "正在验证…" : "此实例需要访问令牌（--secret）"}
        </div>
        <input
          type="password"
          autoFocus
          value={token}
          onChange={e => setToken(e.target.value)}
          placeholder="访问令牌 / token"
          disabled={checking || busy}
          style={{ width: "100%", padding: "10px 12px", borderRadius: 6, border: `1px solid ${err ? "#e0564f" : "#2c3a31"}`, background: "#0c100e", color: "#e8efe9", fontSize: 14, boxSizing: "border-box" }}
        />
        {err && <div style={{ color: "#e0564f", fontSize: 12, marginTop: 8 }}>令牌无效，请重试</div>}
        <button type="submit" disabled={disabled} style={{ marginTop: 16, width: "100%", padding: "10px 12px", borderRadius: 6, border: 0, background: "#58e2a3", color: "#07120c", fontWeight: 700, fontSize: 14, cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.5 : 1 }}>
          {busy ? "验证中…" : "进入"}
        </button>
      </form>
    </div>
  );
}

function AppInner() {
  const askConfirm = useConfirm();
  const notify = useNotify();
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const [page, setPage] = React.useState("dashboard");
  const [navState, setNavState] = React.useState({});

  const [hosts, setHosts] = React.useState([]);
  const [tunnels, setTunnels] = React.useState([]);
  const [loaded, setLoaded] = React.useState(false);

  // Web auth gate. In Tauri or loopback-no-secret mode no token is needed, so
  // we're authed immediately; otherwise validate any stored token, and if it's
  // missing/invalid show the token login screen before loading any data.
  const [authed, setAuthed] = React.useState(!ipc.authRequired);
  const [authChecking, setAuthChecking] = React.useState(ipc.authRequired);

  React.useEffect(() => {
    if (!ipc.authRequired) return;
    let cancelled = false;
    ipc.checkAuth().then(ok => {
      if (cancelled) return;
      setAuthed(ok);
      setAuthChecking(false);
    });
    return () => { cancelled = true; };
  }, []);

  // Initial load from the backend — only once authenticated.
  React.useEffect(() => {
    if (!authed) return;
    let cancelled = false;
    (async () => {
      try {
        const [hs, ts] = await Promise.all([ipc.listHosts(), ipc.listTunnels()]);
        if (cancelled) return;
        setHosts(hs);
        setTunnels(ts);
      } catch (err) {
        console.error("初始数据加载失败:", err);
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => { cancelled = true; };
  }, [authed]);

  const reloadHosts = React.useCallback(async () => {
    setHosts(await ipc.listHosts());
  }, []);
  const reloadTunnels = React.useCallback(async () => {
    setTunnels(await ipc.listTunnels());
  }, []);

  const navigate = (target, state) => {
    setPage(target);
    if (state) setNavState(s => ({ ...s, [target]: state }));
  };

  // One-shot intents (focus / create / import) — page reads them on mount
  // and immediately asks us to clear so re-navigating to the page doesn't
  // re-trigger the same Drawer/Modal.
  const consumeIntent = React.useCallback((target, key) => {
    setNavState(s => {
      const cur = { ...(s[target] || {}) };
      if (cur[key] === undefined) return s;
      delete cur[key];
      return { ...s, [target]: cur };
    });
  }, []);

  // Subscribe to runtime status events — both real (Tauri) and mock modes
  // converge on the same payload shape via lib/ipc.js.
  React.useEffect(() => {
    if (!authed) return;
    const off = ipc.onTunnelStatusChange((p) => {
      setTunnels(ts => ts.map(t => t.id === p.id
        ? { ...t, status: p.status, started_at: p.started_at, last_error: p.last_error }
        : t
      ));
    });
    return off;
  }, [authed]);

  // Host status (connectivity test results) likewise stream in via events.
  React.useEffect(() => {
    if (!authed) return;
    const off = ipc.onHostStatusChange((p) => {
      setHosts(hs => hs.map(h => h.id === p.id
        ? { ...h, status: p.status, last_error: p.last_error, last_latency_ms: p.last_latency_ms ?? h.last_latency_ms }
        : h
      ));
    });
    return off;
  }, [authed]);

  // SSE can drop events (lagged) or reconnect after an error; re-fetch the
  // full lists to resync so the UI never silently shows stale status.
  React.useEffect(() => {
    if (!authed) return;
    const off = ipc.onResyncNeeded(() => {
      ipc.listHosts().then(setHosts).catch(() => {});
      ipc.listTunnels().then(setTunnels).catch(() => {});
    });
    return off;
  }, [authed]);

  const tunnelAction = async (id, action) => {
    if (!id) return;
    const target = tunnels.find(x => x.id === id);
    if (!target) return;
    try {
      if (action === "start")        await ipc.startTunnel(id);
      else if (action === "stop")    await ipc.stopTunnel(id);
      else if (action === "restart") await ipc.restartTunnel(id);
      else if (action === "delete") {
        const ok = await askConfirm({
          title: "删除隧道",
          message: `确定删除「${target.name}」？\n如果它正在运行，会先停止再删除。`,
          confirmLabel: "删除",
          danger: true,
        });
        if (!ok) return;
        await ipc.deleteTunnel(id);
        await reloadTunnels();
      }
    } catch (e) {
      notify({ title: `${action} 失败`, message: e.message || String(e), kind: "error" });
    }
  };

  const handleSaveHost = async (host) => {
    const saved = await ipc.saveHost(host);
    await reloadHosts();
    return saved;
  };
  const handleDeleteHost = async (id) => {
    const target = hosts.find(h => h.id === id);
    const ok = await askConfirm({
      title: "删除主机",
      message: `确定删除「${target?.alias}」？\n如果有隧道在使用它会被阻止删除。`,
      confirmLabel: "删除",
      danger: true,
    });
    if (!ok) return;
    try {
      await ipc.deleteHost(id);
      await reloadHosts();
    } catch (e) {
      notify({ title: "删除失败", message: e.message || String(e), kind: "error" });
    }
  };

  const handleBulkDeleteHosts = async (ids) => {
    if (ids.length === 0) return false;
    const ok = await askConfirm({
      title: `删除 ${ids.length} 台主机`,
      message: `确定删除选中的 ${ids.length} 台主机？\n被隧道引用的主机会被跳过。`,
      confirmLabel: "全部删除",
      danger: true,
    });
    if (!ok) return false;
    const failures = [];
    for (const id of ids) {
      try { await ipc.deleteHost(id); }
      catch (e) {
        const alias = hosts.find(h => h.id === id)?.alias || id;
        failures.push(`${alias}: ${e.message || e}`);
      }
    }
    await reloadHosts();
    if (failures.length > 0) {
      notify({
        title: `${failures.length} 台主机未能删除`,
        message: failures.slice(0, 5).join("\n") + (failures.length > 5 ? `\n…还有 ${failures.length - 5} 条` : ""),
        kind: "error",
      });
    }
    return true;
  };

  const handleBulkDeleteTunnels = async (ids) => {
    if (ids.length === 0) return false;
    const ok = await askConfirm({
      title: `删除 ${ids.length} 条隧道`,
      message: `确定删除选中的 ${ids.length} 条隧道？\n运行中的隧道会先停止再删除。`,
      confirmLabel: "全部删除",
      danger: true,
    });
    if (!ok) return false;
    const failures = [];
    for (const id of ids) {
      try { await ipc.deleteTunnel(id); }
      catch (e) {
        const name = tunnels.find(t => t.id === id)?.name || id;
        failures.push(`${name}: ${e.message || e}`);
      }
    }
    await reloadTunnels();
    if (failures.length > 0) {
      notify({
        title: `${failures.length} 条隧道未能删除`,
        message: failures.slice(0, 5).join("\n") + (failures.length > 5 ? `\n…还有 ${failures.length - 5} 条` : ""),
        kind: "error",
      });
    }
    return true;
  };
  const handleSaveTunnel = async (tunnel) => {
    const saved = await ipc.saveTunnel(tunnel);
    await reloadTunnels();
    return saved;
  };

  if (ipc.authRequired && !authed) {
    return (
      <TokenGate
        checking={authChecking}
        onSubmit={async (token) => {
          ipc.setToken(token);
          const ok = await ipc.checkAuth();
          if (ok) setAuthed(true);
          else ipc.clearToken();
          return ok;
        }}
      />
    );
  }

  const appStyle = {
    "--accent": t.accent,
    "--accent-soft": `color-mix(in oklch, ${t.accent} 14%, transparent)`,
    "--accent-line": `color-mix(in oklch, ${t.accent} 40%, transparent)`,
    "--ok": t.accent,
  };

  const pageNode = (() => {
    if (!loaded) return null;
    switch (page) {
      case "dashboard": return <DashboardPage tunnels={tunnels} hosts={hosts} onNavigate={navigate} onTunnelAction={tunnelAction}/>;
      case "tunnels":   return <TunnelsPage tunnels={tunnels} hosts={hosts} onTunnelAction={tunnelAction} onSaveTunnel={handleSaveTunnel} onReloadTunnels={reloadTunnels} onBulkDelete={handleBulkDeleteTunnels} focus={navState.tunnels?.focus} startCreate={navState.tunnels?.create} startImport={navState.tunnels?.import} onConsumeIntent={(k) => consumeIntent("tunnels", k)}/>;
      case "hosts":     return <HostsPage hosts={hosts} tunnels={tunnels} onSaveHost={handleSaveHost} onDeleteHost={handleDeleteHost} onReloadHosts={reloadHosts} onBulkDelete={handleBulkDeleteHosts} startCreate={navState.hosts?.create} startImport={navState.hosts?.import} onConsumeIntent={(k) => consumeIntent("hosts", k)}/>;
      case "settings":  return <SettingsPage/>;
      default: return null;
    }
  })();

  return (
    <div
      className="app"
      data-theme={t.theme}
      data-nav={t.nav}
      data-radius={t.radius}
      style={appStyle}
    >
      {t.nav === "side" ? (
        <div className="rail" data-expanded={t.railExpanded}>
          {NAV_ITEMS.map(n => (
            <button key={n.id} className="rail-item" aria-selected={page === n.id} onClick={() => setPage(n.id)}>
              <Icon name={n.icon} size={18}/>
              <span className="rail-label">{n.label}</span>
              <span className="tip">{n.label}</span>
            </button>
          ))}
          <div className="spacer"/>
          <button
            className="rail-item rail-toggle"
            onClick={() => setTweak("railExpanded", !t.railExpanded)}
            title={t.railExpanded ? "收起侧栏" : "展开侧栏"}
          >
            <Icon name="chevron" size={16} style={{ transform: t.railExpanded ? "rotate(180deg)" : "none", transition: "transform .2s" }}/>
            <span className="rail-label">收起</span>
          </button>
        </div>
      ) : (
        <div className="topnav">
          <div className="brand">TL</div>
          {NAV_ITEMS.map(n => (
            <button key={n.id} className="topnav-item" aria-selected={page === n.id} onClick={() => setPage(n.id)}>
              <Icon name={n.icon} className="ico" size={13}/>
              <span>{n.label}</span>
            </button>
          ))}
          <div style={{ flex: 1 }}/>
        </div>
      )}

      <div className="main">
        {pageNode}
      </div>
    </div>
  );
}

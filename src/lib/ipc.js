// Tauri IPC wrappers. When running in a plain browser (vite dev without
// tauri), falls back to in-memory mock data so the UI is still functional.

import { invoke } from "@tauri-apps/api/core";
import { HOSTS as MOCK_HOSTS, TUNNELS as MOCK_TUNNELS } from "./data";

export const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

// ─── mock storage (browser-only fallback, kept in memory) ───
let _mockHosts = isTauri ? null : [...MOCK_HOSTS];
let _mockTunnels = isTauri ? null : [...MOCK_TUNNELS];
let _mockNextId = 1000;
const newMockId = (prefix) => `mock-${prefix}-${++_mockNextId}`;

// ─── hosts ───

export async function listHosts() {
  if (!isTauri) return [..._mockHosts];
  return invoke("list_hosts");
}

export async function saveHost(host) {
  if (!isTauri) {
    if (!host.id || host.id === "00000000-0000-0000-0000-000000000000") {
      const h = { ...host, id: newMockId("h"), status: "unknown" };
      _mockHosts.push(h);
      return h;
    }
    const idx = _mockHosts.findIndex(x => x.id === host.id);
    if (idx >= 0) _mockHosts[idx] = { ..._mockHosts[idx], ...host };
    return _mockHosts[idx];
  }
  return invoke("save_host", { host });
}

export async function deleteHost(id) {
  if (!isTauri) {
    _mockHosts = _mockHosts.filter(h => h.id !== id);
    return;
  }
  return invoke("delete_host", { id });
}

// ─── tunnels ───

export async function listTunnels() {
  if (!isTauri) return [..._mockTunnels];
  return invoke("list_tunnels");
}

export async function saveTunnel(tunnel) {
  if (!isTauri) {
    if (!tunnel.id || tunnel.id === "00000000-0000-0000-0000-000000000000") {
      const t = { ...tunnel, id: newMockId("t"), status: "idle" };
      _mockTunnels.push(t);
      return t;
    }
    const idx = _mockTunnels.findIndex(x => x.id === tunnel.id);
    if (idx >= 0) _mockTunnels[idx] = { ..._mockTunnels[idx], ...tunnel };
    return _mockTunnels[idx];
  }
  return invoke("save_tunnel", { tunnel });
}

export async function deleteTunnel(id) {
  if (!isTauri) {
    _mockTunnels = _mockTunnels.filter(t => t.id !== id);
    return;
  }
  return invoke("delete_tunnel", { id });
}

// ─── app meta ───

export async function getAppVersion() {
  if (!isTauri) return "dev";
  const { getVersion } = await import("@tauri-apps/api/app");
  return getVersion();
}

export async function openExternal(url) {
  if (!isTauri) {
    window.open(url, "_blank", "noopener");
    return;
  }
  const { openUrl } = await import("@tauri-apps/plugin-opener");
  return openUrl(url);
}

// ─── autostart (open at login) ───

let _mockAutostartEnabled = false;

export async function isAutostartEnabled() {
  if (!isTauri) return _mockAutostartEnabled;
  const { isEnabled } = await import("@tauri-apps/plugin-autostart");
  return isEnabled();
}

export async function setAutostartEnabled(want) {
  if (!isTauri) {
    _mockAutostartEnabled = !!want;
    return _mockAutostartEnabled;
  }
  const mod = await import("@tauri-apps/plugin-autostart");
  if (want) await mod.enable();
  else await mod.disable();
  return want;
}

// ─── host connectivity test + status events ───

const _mockHostBus = typeof EventTarget !== "undefined" ? new EventTarget() : null;

function _mockEmitHost(id, status, last_error = null) {
  _mockHostBus?.dispatchEvent(new CustomEvent("status", {
    detail: { id, status, last_error },
  }));
}

export function onHostStatusChange(handler) {
  if (isTauri) {
    let unlisten = () => {};
    let cancelled = false;
    import("@tauri-apps/api/event").then(({ listen }) => {
      if (cancelled) return;
      listen("host:status-changed", (e) => handler(e.payload)).then((fn) => {
        if (cancelled) fn(); else unlisten = fn;
      });
    });
    return () => { cancelled = true; unlisten(); };
  }
  const onMock = (e) => handler(e.detail);
  _mockHostBus?.addEventListener("status", onMock);
  return () => _mockHostBus?.removeEventListener("status", onMock);
}

export async function testHost(id, deep = false) {
  if (!isTauri) {
    _mockEmitHost(id, "checking");
    await new Promise((r) => setTimeout(r, 400 + Math.random() * 600));
    const ok = Math.random() < 0.85;
    const status = ok ? "ok" : "fail";
    const last_error = ok ? null : "Connection timed out (mock)";
    _mockEmitHost(id, status, last_error);
    return {
      ok,
      latency_ms: ok ? Math.floor(20 + Math.random() * 180) : null,
      error: last_error,
    };
  }
  return invoke("test_host", { id, deep });
}

// ─── tunnel lifecycle (start / stop / restart) ───
//
// Real Tauri mode: invoke triggers an asynchronous Rust supervisor; status
// updates arrive via the `tunnel:status-changed` event.
//
// Browser mock mode: we simulate the same lifecycle locally so the UI is
// still interactive without Tauri. Mock events flow through `_mockBus`;
// App.jsx subscribes to the same shape regardless of mode.

const _mockBus = typeof EventTarget !== "undefined" ? new EventTarget() : null;

export function onTunnelStatusChange(handler) {
  if (isTauri) {
    // Lazy import to keep mock-mode bundles from pulling Tauri APIs.
    let unlisten = () => {};
    let cancelled = false;
    import("@tauri-apps/api/event").then(({ listen }) => {
      if (cancelled) return;
      listen("tunnel:status-changed", (e) => handler(e.payload)).then(fn => {
        if (cancelled) fn();
        else unlisten = fn;
      });
    });
    return () => { cancelled = true; unlisten(); };
  }
  const onMock = (e) => handler(e.detail);
  _mockBus?.addEventListener("status", onMock);
  return () => _mockBus?.removeEventListener("status", onMock);
}

function _mockEmit(id, status, started_at = null, last_error = null) {
  _mockBus?.dispatchEvent(new CustomEvent("status", {
    detail: { id, status, started_at, last_error },
  }));
}

export async function startTunnel(id) {
  if (!isTauri) {
    _mockEmit(id, "connecting");
    setTimeout(() => _mockEmit(id, "connected", Date.now()), 800);
    return;
  }
  return invoke("start_tunnel", { id });
}

export async function stopTunnel(id) {
  if (!isTauri) {
    _mockEmit(id, "stopping");
    setTimeout(() => _mockEmit(id, "idle"), 300);
    return;
  }
  return invoke("stop_tunnel", { id });
}

export async function restartTunnel(id) {
  if (!isTauri) {
    _mockEmit(id, "connecting");
    setTimeout(() => _mockEmit(id, "connected", Date.now()), 800);
    return;
  }
  return invoke("restart_tunnel", { id });
}

// ─── ssh config import ───

// Mock fallback returns a small static dataset so the modal is still
// inspectable in plain-browser dev mode.
function _mockHostCandidates() {
  const existing = new Set(_mockHosts.map(h => h.alias));
  return [
    { alias: "ml-gpu-2", hostname: "gpu-2.example.com", port: 22, user: "ml", identity_file: null, proxy_jump_alias: null },
    { alias: "edge-sg-new", hostname: "sg.example.com", port: 22, user: "ops", identity_file: null, proxy_jump_alias: null },
    { alias: "bastion-prod", hostname: "203.0.113.42", port: 22, user: "ops", identity_file: "~/.ssh/id_ed25519_prod", proxy_jump_alias: null },
  ].map(c => ({ ...c, exists: existing.has(c.alias) }));
}

function _mockTunnelCandidates() {
  return [
    { name_suggestion: "gw-eu-5432", type: "L", local_port: 5432, remote_host: "10.0.4.21", remote_port: 5432, host_alias: "gw-eu", line: "LocalForward 5432 10.0.4.21:5432" },
    { name_suggestion: "jp-vps-1080", type: "D", local_port: 1080, remote_host: null, remote_port: null, host_alias: "jp-vps", line: "DynamicForward 1080" },
  ];
}

export async function parseSshConfigHosts() {
  if (!isTauri) return _mockHostCandidates();
  return invoke("parse_ssh_config_hosts");
}

export async function parseSshConfigTunnels() {
  if (!isTauri) return _mockTunnelCandidates();
  return invoke("parse_ssh_config_tunnels");
}

export async function importHosts(candidates) {
  if (!isTauri) {
    const aliases = new Set(_mockHosts.map(h => h.alias));
    const news = candidates.filter(c => !aliases.has(c.alias));
    const saved = news.map(c => {
      const h = {
        id: newMockId("h"),
        alias: c.alias,
        hostname: c.hostname,
        port: c.port,
        user: c.user,
        identity_file: c.identity_file,
        proxy_jump: null,  // mock: 不解析 alias 链
        source: "config",
        status: "unknown",
        last_error: null,
      };
      _mockHosts.push(h);
      return h;
    });
    return saved;
  }
  return invoke("import_hosts", { candidates });
}

export async function importTunnels(candidates) {
  if (!isTauri) {
    const byAlias = new Map(_mockHosts.map(h => [h.alias, h.id]));
    const saved = [];
    for (const c of candidates) {
      const host_id = byAlias.get(c.host_alias);
      if (!host_id) continue;
      const dup = _mockTunnels.some(t => t.host_id === host_id && t.type === c.type && t.local_port === c.local_port);
      if (dup) continue;
      const t = {
        id: newMockId("t"),
        name: c.name_suggestion,
        type: c.type,
        local_port: c.local_port,
        remote_host: c.remote_host,
        remote_port: c.remote_port,
        host_id,
        keep_alive: true,
        auto_start: false,
        status: "idle",
        started_at: null,
        last_error: null,
      };
      _mockTunnels.push(t);
      saved.push(t);
    }
    return saved;
  }
  return invoke("import_tunnels", { candidates });
}

// ─── settings ───

const DEFAULT_SETTINGS = {
  ssh_path: null,
  ssh_config_path: null,
  auto_start_on_boot: false,
  auto_connect_on_boot: true,
  auto_sync_ssh_config: true,
  minimize_to_tray_on_close: true,
};

let _mockSettings = { ...DEFAULT_SETTINGS };

export async function getSettings() {
  if (!isTauri) return { ..._mockSettings };
  return invoke("get_settings");
}

export async function saveSettings(settings) {
  if (!isTauri) {
    _mockSettings = { ..._mockSettings, ...settings };
    return _mockSettings;
  }
  return invoke("save_settings", { settings });
}

// Convenience: the nil UUID Rust accepts for "new entity".
export const NIL_UUID = "00000000-0000-0000-0000-000000000000";

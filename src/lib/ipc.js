// src/lib/ipc.js — three transports, one API surface.
//
// Detection (in priority order):
//   1. Tauri WebView   →  __TAURI_INTERNALS__ present, use invoke()
//   2. Web mode        →  __TUNELO_WEB__=true (injected by Rust HTTP server)
//   3. Vite dev proxy  →  fallback — assume server is at /api via vite proxy
//
// (1) speaks Tauri IPC; (2) and (3) both speak HTTP via fetch. There is
// no in-memory mock — to develop the UI without Tauri, run
// `tunelo --web` and then `bun run dev` (Vite proxies /api and /events).

import { invoke } from "@tauri-apps/api/core";

export const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
const TOKEN = (typeof window !== "undefined" && window.__TUNELO_TOKEN__) || "";

// ─── HTTP helpers ───

async function http(method, path, body) {
  const headers = { "Content-Type": "application/json" };
  if (TOKEN) headers["Authorization"] = `Bearer ${TOKEN}`;
  const res = await fetch("/api" + path, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try {
      const j = await res.json();
      if (j.error) msg = j.error;
    } catch {}
    throw new Error(msg);
  }
  if (res.status === 204) return undefined;
  const ct = res.headers.get("content-type") || "";
  if (ct.includes("application/json")) return res.json();
  return undefined;
}

const httpGet = (p)        => http("GET", p);
const httpPost = (p, body) => http("POST", p, body);
const httpDel  = (p)       => http("DELETE", p);

// ─── hosts ───

export async function listHosts() {
  return isTauri ? invoke("list_hosts") : httpGet("/hosts");
}
export async function saveHost(host) {
  return isTauri ? invoke("save_host", { host }) : httpPost("/hosts", host);
}
export async function deleteHost(id) {
  return isTauri ? invoke("delete_host", { id }) : httpDel(`/hosts/${id}`);
}

// ─── tunnels ───

export async function listTunnels() {
  return isTauri ? invoke("list_tunnels") : httpGet("/tunnels");
}
export async function saveTunnel(tunnel) {
  return isTauri ? invoke("save_tunnel", { tunnel }) : httpPost("/tunnels", tunnel);
}
export async function deleteTunnel(id) {
  return isTauri ? invoke("delete_tunnel", { id }) : httpDel(`/tunnels/${id}`);
}
export async function startTunnel(id) {
  return isTauri ? invoke("start_tunnel", { id }) : httpPost(`/tunnels/${id}/start`);
}
export async function stopTunnel(id) {
  return isTauri ? invoke("stop_tunnel", { id }) : httpPost(`/tunnels/${id}/stop`);
}
export async function restartTunnel(id) {
  return isTauri ? invoke("restart_tunnel", { id }) : httpPost(`/tunnels/${id}/restart`);
}

// ─── settings ───

export async function getSettings() {
  return isTauri ? invoke("get_settings") : httpGet("/settings");
}
export async function saveSettings(settings) {
  return isTauri ? invoke("save_settings", { settings }) : httpPost("/settings", settings);
}

// ─── host test ───

export async function testHost(id, deep = false) {
  if (isTauri) return invoke("test_host", { id, deep });
  return httpPost(`/hosts/${id}/test?deep=${deep ? "true" : "false"}`);
}

// ─── ssh config import ───

export async function parseSshConfigHosts() {
  return isTauri ? invoke("parse_ssh_config_hosts") : httpGet("/ssh-config/hosts");
}
export async function parseSshConfigTunnels() {
  return isTauri ? invoke("parse_ssh_config_tunnels") : httpGet("/ssh-config/tunnels");
}
export async function importHosts(candidates) {
  return isTauri ? invoke("import_hosts", { candidates }) : httpPost("/ssh-config/import-hosts", candidates);
}
export async function importTunnels(candidates) {
  return isTauri ? invoke("import_tunnels", { candidates }) : httpPost("/ssh-config/import-tunnels", candidates);
}

// ─── app meta / opener / autostart ───

export async function getAppVersion() {
  if (!isTauri) return "web";
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

// autostart only makes sense in GUI mode (login-item registration).
// Web mode reports `false` and silently no-ops on set.
export async function isAutostartEnabled() {
  if (!isTauri) return false;
  const { isEnabled } = await import("@tauri-apps/plugin-autostart");
  return isEnabled();
}
export async function setAutostartEnabled(want) {
  if (!isTauri) return !!want;
  const mod = await import("@tauri-apps/plugin-autostart");
  if (want) await mod.enable(); else await mod.disable();
  return want;
}

// ─── events: SSE in non-Tauri modes, tauri::listen in GUI mode ───

let _sseSource = null;

function ensureSse() {
  if (_sseSource) return _sseSource;
  const url = TOKEN ? `/events?token=${encodeURIComponent(TOKEN)}` : "/events";
  _sseSource = new EventSource(url);
  return _sseSource;
}

function sseSubscribe(topic, handler) {
  const src = ensureSse();
  const wrap = (e) => {
    let payload;
    try { payload = JSON.parse(e.data); } catch { payload = e.data; }
    handler(payload);
  };
  src.addEventListener(topic, wrap);
  return () => {
    src.removeEventListener(topic, wrap);
  };
}

export function onTunnelStatusChange(handler) {
  if (isTauri) {
    let unlisten = () => {};
    let cancelled = false;
    import("@tauri-apps/api/event").then(({ listen }) => {
      if (cancelled) return;
      listen("tunnel:status-changed", (e) => handler(e.payload)).then(fn => {
        if (cancelled) fn(); else unlisten = fn;
      });
    });
    return () => { cancelled = true; unlisten(); };
  }
  return sseSubscribe("tunnel:status-changed", handler);
}

export function onHostStatusChange(handler) {
  if (isTauri) {
    let unlisten = () => {};
    let cancelled = false;
    import("@tauri-apps/api/event").then(({ listen }) => {
      if (cancelled) return;
      listen("host:status-changed", (e) => handler(e.payload)).then(fn => {
        if (cancelled) fn(); else unlisten = fn;
      });
    });
    return () => { cancelled = true; unlisten(); };
  }
  return sseSubscribe("host:status-changed", handler);
}

export const NIL_UUID = "00000000-0000-0000-0000-000000000000";

// ─── pure data helpers (formerly in data.js) ───
// These are stateless utilities used by UI components to traverse
// the host/tunnel lists that are now fetched via IPC/HTTP above.

export function hostById(id, hosts = []) {
  return hosts.find(h => h.id === id);
}

export function tunnelsByHost(hid, tunnels = []) {
  return tunnels.filter(t => t.host_id === hid);
}

export function proxyChain(host, hosts = []) {
  const chain = [host];
  let cur = host;
  while (cur && cur.proxy_jump) {
    const nx = hostById(cur.proxy_jump, hosts);
    if (!nx || chain.includes(nx)) break;
    chain.unshift(nx);
    cur = nx;
  }
  return chain;
}

export function formatUptime(sec) {
  if (!sec) return "—";
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (d) return `${d}d${h}h`;
  if (h) return `${h}h${m}m`;
  return `${m}m`;
}

export function sshCommand(tunnel, host, hosts = []) {
  if (!host) return "";
  const parts = ["ssh", "-N"];
  if (tunnel) {
    if (tunnel.type === "L") parts.push(`-L ${tunnel.local_port}:${tunnel.remote_host}:${tunnel.remote_port}`);
    if (tunnel.type === "R") parts.push(`-R ${tunnel.local_port}:${tunnel.remote_host}:${tunnel.remote_port}`);
    if (tunnel.type === "D") parts.push(`-D ${tunnel.local_port}`);
  }
  if (host.proxy_jump) {
    const chain = proxyChain(host, hosts).slice(0, -1).map(h => h.alias).join(",");
    if (chain) parts.push(`-J ${chain}`);
  }
  parts.push(host.alias);
  return parts.join(" ");
}

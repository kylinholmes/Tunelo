// Mock data + helpers. Will be replaced incrementally by Tauri-backed real
// stores (HostStore / TunnelStore via IPC) once the Rust side lands.

export const HOSTS = [
  { id: "h1", alias: "bastion-prod", hostname: "203.0.113.42", port: 22, user: "ops", identity_file: "~/.ssh/id_ed25519_prod", proxy_jump: null, source: "config", status: "ok" },
  { id: "h2", alias: "gw-eu", hostname: "gateway.eu.example.com", port: 22, user: "deploy", identity_file: "~/.ssh/id_ed25519_prod", proxy_jump: "h1", source: "config", status: "ok" },
  { id: "h4", alias: "jp-vps", hostname: "jp.example.com", port: 2222, user: "root", identity_file: "~/.ssh/id_rsa_jp", proxy_jump: null, source: "manual", status: "ok" },
  { id: "h5", alias: "legacy-build", hostname: "build.old.lan", port: 22, user: "ci", proxy_jump: null, source: "config", status: "fail", last_error: "Connection timed out" },
  { id: "h7", alias: "home-nas", hostname: "nas.home.lan", port: 22, user: "admin", proxy_jump: null, source: "manual", status: "ok" },
];

export const TUNNELS = [
  { id: "t1", name: "pg-prod", type: "L", local_port: 5432, remote_host: "10.0.4.21", remote_port: 5432, host_id: "h2", keep_alive: true, auto_start: true, status: "connected", started_at: Date.now() - 4 * 3600 * 1000 - 12 * 60 * 1000 },
  { id: "t2", name: "redis-prod", type: "L", local_port: 6379, remote_host: "cache-1.internal", remote_port: 6379, host_id: "h2", keep_alive: true, auto_start: true, status: "connected", started_at: Date.now() - 6 * 3600 * 1000 },
  { id: "t3", name: "socks-jp", type: "D", local_port: 1080, remote_host: null, remote_port: null, host_id: "h4", keep_alive: true, auto_start: true, status: "connected", started_at: Date.now() - 47 * 60 * 1000 },
  { id: "t4", name: "grafana", type: "L", local_port: 3001, remote_host: "grafana.internal", remote_port: 3000, host_id: "h1", keep_alive: true, auto_start: false, status: "reconnecting", last_error: "exit 255: kex_exchange_identification" },
  { id: "t6", name: "old-mysql", type: "L", local_port: 3307, remote_host: "mysql.old", remote_port: 3306, host_id: "h5", keep_alive: false, auto_start: false, status: "failed", last_error: "host \"legacy-build\" 不可达" },
  { id: "t8", name: "git-mirror", type: "R", local_port: 2022, remote_host: "git.internal", remote_port: 22, host_id: "h7", keep_alive: false, auto_start: false, status: "idle" },
];

export function hostById(id, hosts = HOSTS) {
  return hosts.find(h => h.id === id);
}

export function tunnelsByHost(hid, tunnels = TUNNELS) {
  return tunnels.filter(t => t.host_id === hid);
}

export function proxyChain(host, hosts = HOSTS) {
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

export function sshCommand(tunnel, host, hosts = HOSTS) {
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

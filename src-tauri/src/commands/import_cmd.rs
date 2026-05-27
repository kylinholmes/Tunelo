use std::collections::{HashMap, HashSet};
use std::path::PathBuf;

use serde::{Deserialize, Serialize};
use tauri::State;
use uuid::Uuid;

use crate::AppState;
use crate::error::AppResult;
use crate::ssh_config;
use crate::store::{Host, HostSource, HostStatus, Tunnel, TunnelStatus, TunnelType};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HostCandidate {
    pub alias: String,
    pub hostname: String,
    pub port: u16,
    pub user: String,
    pub identity_file: Option<String>,
    pub proxy_jump_alias: Option<String>,
    pub exists: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TunnelCandidate {
    pub name_suggestion: String,
    #[serde(rename = "type")]
    pub kind: TunnelType,
    pub local_port: u16,
    pub remote_host: Option<String>,
    pub remote_port: Option<u16>,
    pub host_alias: String,
    pub line: String,
}

fn resolve_ssh_config_path(state: &AppState) -> AppResult<Option<PathBuf>> {
    let settings = state.settings.get();
    let raw = match settings.ssh_config_path {
        Some(p) if !p.trim().is_empty() => p,
        _ => return Ok(None),
    };
    Ok(Some(expand_tilde(&raw)))
}

fn expand_tilde(path: &str) -> PathBuf {
    if let Some(rest) = path.strip_prefix("~") {
        if let Some(home) = dirs::home_dir() {
            let trimmed = rest.trim_start_matches(['/', '\\']);
            return home.join(trimmed);
        }
    }
    PathBuf::from(path)
}

fn read_parsed(state: &AppState) -> AppResult<Vec<ssh_config::ParsedHost>> {
    let path = match resolve_ssh_config_path(state)? {
        Some(p) => p,
        None => return Ok(Vec::new()),
    };
    if !path.exists() {
        // not configured / fresh machine — treat as empty rather than failing
        return Ok(Vec::new());
    }
    let content = std::fs::read_to_string(&path)?;
    Ok(ssh_config::parse(&content))
}

fn fallback_user() -> String {
    std::env::var("USER")
        .or_else(|_| std::env::var("USERNAME"))
        .unwrap_or_default()
}

#[tauri::command]
pub fn parse_ssh_config_hosts(state: State<'_, AppState>) -> AppResult<Vec<HostCandidate>> {
    let parsed = read_parsed(&state)?;
    let existing_aliases: HashSet<String> = state.store.list_hosts()
        .into_iter()
        .map(|h| h.alias)
        .collect();

    let fallback = fallback_user();
    let candidates = parsed.into_iter().map(|h| HostCandidate {
        hostname: h.hostname.clone().unwrap_or_else(|| h.alias.clone()),
        port: h.port.unwrap_or(22),
        user: h.user.clone().unwrap_or_else(|| fallback.clone()),
        identity_file: h.identity_file,
        proxy_jump_alias: h.proxy_jump_alias,
        exists: existing_aliases.contains(&h.alias),
        alias: h.alias,
    }).collect();

    Ok(candidates)
}

#[tauri::command]
pub fn parse_ssh_config_tunnels(state: State<'_, AppState>) -> AppResult<Vec<TunnelCandidate>> {
    let parsed = read_parsed(&state)?;
    let mut out = Vec::new();
    for h in &parsed {
        for f in &h.forwards {
            let (kind, local_port, remote_host, remote_port, line) = match f {
                ssh_config::ParsedForward::Local { local_port, remote_host, remote_port } => (
                    TunnelType::L, *local_port,
                    Some(remote_host.clone()), Some(*remote_port),
                    format!("LocalForward {} {}:{}", local_port, remote_host, remote_port),
                ),
                ssh_config::ParsedForward::Remote { local_port, remote_host, remote_port } => (
                    TunnelType::R, *local_port,
                    Some(remote_host.clone()), Some(*remote_port),
                    format!("RemoteForward {} {}:{}", local_port, remote_host, remote_port),
                ),
                ssh_config::ParsedForward::Dynamic { local_port } => (
                    TunnelType::D, *local_port,
                    None, None,
                    format!("DynamicForward {}", local_port),
                ),
            };
            out.push(TunnelCandidate {
                name_suggestion: format!("{}-{}", h.alias, local_port),
                kind, local_port, remote_host, remote_port,
                host_alias: h.alias.clone(),
                line,
            });
        }
    }
    Ok(out)
}

#[tauri::command]
pub fn import_hosts(
    state: State<'_, AppState>,
    candidates: Vec<HostCandidate>,
) -> AppResult<Vec<Host>> {
    let existing = state.store.list_hosts();
    let existing_aliases: HashSet<String> = existing.iter()
        .map(|h| h.alias.clone())
        .collect();

    // Pre-allocate ids for each new candidate so proxy_jump_alias references
    // to other newly-imported hosts can resolve in the same pass.
    let mut alias_to_id: HashMap<String, Uuid> = existing.iter()
        .map(|h| (h.alias.clone(), h.id))
        .collect();
    for c in &candidates {
        if !alias_to_id.contains_key(&c.alias) {
            alias_to_id.insert(c.alias.clone(), Uuid::new_v4());
        }
    }

    let mut saved = Vec::new();
    for c in candidates {
        if existing_aliases.contains(&c.alias) {
            // Existing alias — skip (don't overwrite user-edited records).
            continue;
        }
        let id = alias_to_id[&c.alias];
        let host = Host {
            id,
            alias: c.alias,
            hostname: c.hostname,
            port: c.port,
            user: c.user,
            identity_file: c.identity_file,
            proxy_jump: c.proxy_jump_alias.and_then(|a| alias_to_id.get(&a).copied()),
            source: HostSource::Config,
            status: HostStatus::Unknown,
            last_error: None,
        };
        saved.push(state.store.save_host(host)?);
    }
    Ok(saved)
}

#[tauri::command]
pub fn import_tunnels(
    state: State<'_, AppState>,
    candidates: Vec<TunnelCandidate>,
) -> AppResult<Vec<Tunnel>> {
    let hosts = state.store.list_hosts();
    let alias_to_id: HashMap<String, Uuid> = hosts.iter()
        .map(|h| (h.alias.clone(), h.id))
        .collect();
    let existing = state.store.list_tunnels();

    let mut saved = Vec::new();
    for c in candidates {
        // host_id resolution: the user is expected to have imported the
        // matching host first. Otherwise skip silently.
        let Some(&host_id) = alias_to_id.get(&c.host_alias) else { continue };

        // Dedup: (host_id, kind, local_port) — same host can't host two
        // tunnels of the same kind on the same local port.
        let dup = existing.iter().any(|t|
            t.host_id == host_id && t.kind == c.kind && t.local_port == c.local_port
        );
        if dup { continue; }

        let tunnel = Tunnel {
            id: Uuid::nil(),       // store.save_tunnel will allocate
            name: c.name_suggestion,
            kind: c.kind,
            local_port: c.local_port,
            bind_address: None,
            remote_host: c.remote_host,
            remote_port: c.remote_port,
            host_id,
            keep_alive: true,
            auto_start: false,
            status: TunnelStatus::Idle,
            started_at: None,
            last_error: None,
        };
        saved.push(state.store.save_tunnel(tunnel)?);
    }
    Ok(saved)
}

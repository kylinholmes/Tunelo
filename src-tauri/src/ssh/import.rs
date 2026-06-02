// src-tauri/src/ssh/import.rs
// Shared, framework-agnostic implementations of the SSH-config import flow.
// commands/import_cmd.rs (Tauri) and web/routes/import.rs (HTTP) both
// delegate here.

use std::collections::{HashMap, HashSet};
use std::path::PathBuf;

use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::core::AppContext;
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

fn expand_tilde(path: &str) -> PathBuf {
    if let Some(rest) = path.strip_prefix("~") {
        if let Some(home) = dirs::home_dir() {
            let trimmed = rest.trim_start_matches(['/', '\\']);
            return home.join(trimmed);
        }
    }
    PathBuf::from(path)
}

fn read_parsed(ctx: &AppContext) -> AppResult<Vec<ssh_config::ParsedHost>> {
    let settings = ctx.settings.get();
    let raw = match settings.ssh_config_path {
        Some(p) if !p.trim().is_empty() => p,
        _ => return Ok(Vec::new()),
    };
    let path = expand_tilde(&raw);
    if !path.exists() {
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

pub fn parse_hosts(ctx: &AppContext) -> AppResult<Vec<HostCandidate>> {
    let parsed = read_parsed(ctx)?;
    let existing_aliases: HashSet<String> = ctx.store.list_hosts()
        .into_iter()
        .map(|h| h.alias)
        .collect();
    let fallback = fallback_user();
    Ok(parsed.into_iter().map(|h| HostCandidate {
        hostname: h.hostname.clone().unwrap_or_else(|| h.alias.clone()),
        port: h.port.unwrap_or(22),
        user: h.user.clone().unwrap_or_else(|| fallback.clone()),
        identity_file: h.identity_file,
        proxy_jump_alias: h.proxy_jump_alias,
        exists: existing_aliases.contains(&h.alias),
        alias: h.alias,
    }).collect())
}

pub fn parse_tunnels(ctx: &AppContext) -> AppResult<Vec<TunnelCandidate>> {
    let parsed = read_parsed(ctx)?;
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

pub fn import_hosts(ctx: &AppContext, candidates: Vec<HostCandidate>) -> AppResult<Vec<Host>> {
    let existing = ctx.store.list_hosts();
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
            last_latency_ms: None,
        };
        saved.push(ctx.store.save_host(host)?);
    }
    Ok(saved)
}

pub fn import_tunnels(ctx: &AppContext, candidates: Vec<TunnelCandidate>) -> AppResult<Vec<Tunnel>> {
    let hosts = ctx.store.list_hosts();
    let alias_to_id: HashMap<String, Uuid> = hosts.iter()
        .map(|h| (h.alias.clone(), h.id))
        .collect();
    let existing = ctx.store.list_tunnels();

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
        saved.push(ctx.store.save_tunnel(tunnel)?);
    }
    Ok(saved)
}

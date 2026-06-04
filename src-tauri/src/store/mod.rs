use std::path::PathBuf;
use std::sync::RwLock;
use serde::{Serialize, Deserialize};
use uuid::Uuid;

use crate::error::{AppError, AppResult};

pub mod host;
pub mod tunnel;

#[allow(unused_imports)]
pub use host::{Host, HostSource, HostStatus};
#[allow(unused_imports)]
pub use tunnel::{Tunnel, TunnelStatus, TunnelType};

#[derive(Debug, Default, Serialize, Deserialize)]
struct StateFile {
    #[serde(default)] hosts: Vec<Host>,
    #[serde(default)] tunnels: Vec<Tunnel>,
}

pub struct Store {
    path: PathBuf,
    hosts: RwLock<Vec<Host>>,
    tunnels: RwLock<Vec<Tunnel>>,
}

impl Store {
    pub fn load(path: PathBuf) -> AppResult<Self> {
        let initial = if path.exists() {
            match std::fs::read_to_string(&path) {
                // A parse failure used to be swallowed into an empty store and
                // then overwritten on the next save — silent, unrecoverable
                // data loss. Instead, move the unparseable file aside so it can
                // be recovered, then start empty.
                Ok(text) => match toml::from_str::<StateFile>(&text) {
                    Ok(sf) => sf,
                    Err(e) => {
                        backup_corrupt(&path, &e.to_string());
                        StateFile::default()
                    }
                },
                Err(_) => StateFile::default(),
            }
        } else {
            StateFile::default()
        };
        Ok(Self {
            path,
            hosts: RwLock::new(initial.hosts),
            tunnels: RwLock::new(initial.tunnels),
        })
    }

    pub fn list_hosts(&self) -> Vec<Host> {
        self.hosts.read().unwrap().clone()
    }

    pub fn list_tunnels(&self) -> Vec<Tunnel> {
        self.tunnels.read().unwrap().clone()
    }

    pub fn get_host(&self, id: Uuid) -> Option<Host> {
        self.hosts.read().unwrap().iter().find(|h| h.id == id).cloned()
    }

    /// Update host.status / last_latency_ms / last_error from a connectivity
    /// test result. Persists — these signals are useful across restarts
    /// ("which host failed last time, and how fast was it?").
    pub fn set_host_status(
        &self,
        id: Uuid,
        status: HostStatus,
        last_latency_ms: Option<u32>,
        last_error: Option<String>,
    ) -> AppResult<()> {
        {
            let mut hosts = self.hosts.write().unwrap();
            let Some(h) = hosts.iter_mut().find(|h| h.id == id) else {
                return Err(AppError::not_found("host"));
            };
            h.status = status;
            h.last_error = last_error;
            h.last_latency_ms = last_latency_ms;
        }
        self.persist()
    }

    pub fn get_tunnel(&self, id: Uuid) -> Option<Tunnel> {
        self.tunnels.read().unwrap().iter().find(|t| t.id == id).cloned()
    }

    /// In-memory update of the runtime fields (status / started_at /
    /// last_error). Does NOT persist — these are transient between runs
    /// and only persisting on every emit would thrash the disk. The next
    /// real save (save_tunnel) will pick up whatever is current.
    pub fn update_runtime(
        &self,
        id: Uuid,
        status: TunnelStatus,
        started_at: Option<i64>,
        last_error: Option<String>,
    ) -> AppResult<()> {
        let mut tunnels = self.tunnels.write().unwrap();
        let Some(t) = tunnels.iter_mut().find(|t| t.id == id) else {
            return Err(AppError::not_found("tunnel"));
        };
        t.status = status;
        // Connected status sets started_at; transitions that don't carry a
        // timestamp clear it for non-Connected states.
        if status == TunnelStatus::Connected {
            t.started_at = started_at;
        } else if matches!(status, TunnelStatus::Idle | TunnelStatus::Failed) {
            t.started_at = None;
        }
        t.last_error = last_error;
        Ok(())
    }

    /// Called once at boot to clear stale runtime state from the on-disk
    /// snapshot — no ssh subprocess is actually running yet.
    pub fn reset_runtime_states(&self) {
        let mut tunnels = self.tunnels.write().unwrap();
        for t in tunnels.iter_mut() {
            t.status = TunnelStatus::Idle;
            t.started_at = None;
            // keep last_error so the user sees why the last run failed
        }
    }

    pub fn tunnels_with_auto_start(&self) -> Vec<Uuid> {
        self.tunnels.read().unwrap()
            .iter()
            .filter(|t| t.auto_start)
            .map(|t| t.id)
            .collect()
    }

    pub fn save_host(&self, mut host: Host) -> AppResult<Host> {
        if host.alias.trim().is_empty() {
            return Err(AppError::invalid("alias 不能为空"));
        }
        if host.hostname.trim().is_empty() {
            return Err(AppError::invalid("hostname 不能为空"));
        }
        // proxy_jump 链路检测：禁止自引用 / 循环
        if let Some(pj) = host.proxy_jump {
            if pj == host.id && host.id != Uuid::nil() {
                return Err(AppError::invalid("proxy_jump 不能指向自己"));
            }
            let hosts = self.hosts.read().unwrap();
            let mut cur = pj;
            let mut visited: Vec<Uuid> = if host.id == Uuid::nil() { vec![] } else { vec![host.id] };
            loop {
                if visited.contains(&cur) {
                    return Err(AppError::invalid("proxy_jump 链路存在循环"));
                }
                visited.push(cur);
                let next = hosts.iter().find(|h| h.id == cur).and_then(|h| h.proxy_jump);
                match next {
                    Some(n) => cur = n,
                    None => break,
                }
            }
        }

        {
            let mut hosts = self.hosts.write().unwrap();
            if host.id == Uuid::nil() {
                host.id = Uuid::new_v4();
                hosts.push(host.clone());
            } else if let Some(existing) = hosts.iter_mut().find(|h| h.id == host.id) {
                *existing = host.clone();
            } else {
                hosts.push(host.clone());
            }
        }
        self.persist()?;
        Ok(host)
    }

    pub fn delete_host(&self, id: Uuid) -> AppResult<()> {
        {
            // Hold the hosts write lock across the reference check + delete so a
            // concurrent save_tunnel (which takes hosts.read to validate host_id
            // before inserting) can't slip a new reference in between — that
            // would leave a tunnel pointing at a deleted host. Lock order is
            // hosts-before-tunnels everywhere, so this can't deadlock.
            let mut hosts = self.hosts.write().unwrap();
            let referencing: Vec<String> = self.tunnels.read().unwrap()
                .iter()
                .filter(|t| t.host_id == id)
                .map(|t| t.name.clone())
                .collect();
            if !referencing.is_empty() {
                return Err(AppError::new(
                    "host_in_use",
                    format!("被以下隧道引用：{}", referencing.join(", ")),
                ));
            }
            let before = hosts.len();
            hosts.retain(|h| h.id != id);
            if hosts.len() == before {
                return Err(AppError::not_found("host"));
            }
            // 清理其他 host 指向被删主机的 proxy_jump
            for h in hosts.iter_mut() {
                if h.proxy_jump == Some(id) {
                    h.proxy_jump = None;
                }
            }
        }
        self.persist()
    }

    pub fn save_tunnel(&self, mut tunnel: Tunnel) -> AppResult<Tunnel> {
        if tunnel.name.trim().is_empty() {
            return Err(AppError::invalid("name 不能为空"));
        }
        if tunnel.local_port == 0 {
            return Err(AppError::invalid("本地端口必须在 1-65535 之间"));
        }
        if !self.hosts.read().unwrap().iter().any(|h| h.id == tunnel.host_id) {
            return Err(AppError::invalid("host_id 不存在"));
        }
        match tunnel.kind {
            TunnelType::L | TunnelType::R => {
                let bad_host = tunnel.remote_host.as_ref().map_or(true, |s| s.trim().is_empty());
                if bad_host || tunnel.remote_port.is_none() {
                    return Err(AppError::invalid("L/R 类型必须有 remote_host 和 remote_port"));
                }
            }
            TunnelType::D => {
                tunnel.remote_host = None;
                tunnel.remote_port = None;
            }
        }

        {
            let mut tunnels = self.tunnels.write().unwrap();
            if tunnel.id == Uuid::nil() {
                tunnel.id = Uuid::new_v4();
                tunnel.status = TunnelStatus::Idle;
                tunnel.started_at = None;
                tunnel.last_error = None;
                tunnels.push(tunnel.clone());
            } else if let Some(existing) = tunnels.iter_mut().find(|t| t.id == tunnel.id) {
                // 保留运行时字段（status / started_at / last_error）
                tunnel.status = existing.status;
                tunnel.started_at = existing.started_at;
                tunnel.last_error = existing.last_error.clone();
                *existing = tunnel.clone();
            } else {
                tunnels.push(tunnel.clone());
            }
        }
        self.persist()?;
        Ok(tunnel)
    }

    pub fn delete_tunnel(&self, id: Uuid) -> AppResult<()> {
        {
            let mut tunnels = self.tunnels.write().unwrap();
            let before = tunnels.len();
            tunnels.retain(|t| t.id != id);
            if tunnels.len() == before {
                return Err(AppError::not_found("tunnel"));
            }
        }
        self.persist()
    }

    fn persist(&self) -> AppResult<()> {
        let snapshot = StateFile {
            hosts: self.hosts.read().unwrap().clone(),
            tunnels: self.tunnels.read().unwrap().clone(),
        };
        if let Some(parent) = self.path.parent() {
            std::fs::create_dir_all(parent)?;
        }
        // Keep the last-good file as a .bak before overwriting, so a single
        // bad write or a later corruption is recoverable.
        if self.path.exists() {
            let bak = self.path.with_extension("toml.bak");
            let _ = std::fs::copy(&self.path, &bak);
        }
        let text = toml::to_string_pretty(&snapshot)?;
        let tmp = self.path.with_extension("toml.tmp");
        std::fs::write(&tmp, text)?;
        std::fs::rename(&tmp, &self.path)?;
        Ok(())
    }
}

/// Move an unparseable state file aside (timestamped so repeated corruptions
/// don't clobber earlier backups) and warn, instead of silently discarding it.
fn backup_corrupt(path: &std::path::Path, err: &str) {
    let ts = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    let bak = path.with_extension(format!("toml.corrupt-{ts}"));
    let _ = std::fs::rename(path, &bak);
    eprintln!(
        "tunelo: state file {} is unparseable ({}); moved to {} and starting empty",
        path.display(), err, bak.display()
    );
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_path() -> PathBuf {
        std::env::temp_dir().join(format!("tunelo-store-test-{}.toml", Uuid::new_v4()))
    }

    fn sample_host() -> Host {
        Host {
            id: Uuid::nil(),
            alias: "h".into(),
            hostname: "h.example".into(),
            port: 22,
            user: "me".into(),
            identity_file: None,
            proxy_jump: None,
            source: HostSource::Manual,
            status: HostStatus::Unknown,
            last_error: None,
            last_latency_ms: None,
        }
    }

    #[test]
    fn corrupt_state_file_is_backed_up_not_destroyed() {
        let path = temp_path();
        std::fs::write(&path, "this is { not valid toml ][").unwrap();
        let store = Store::load(path.clone()).unwrap();
        // starts empty rather than panicking
        assert!(store.list_hosts().is_empty());
        // the corrupt content was preserved in a sibling backup, not discarded
        let dir = path.parent().unwrap();
        let stem = path.file_name().unwrap().to_string_lossy().into_owned();
        let backed_up = std::fs::read_dir(dir).unwrap().flatten().any(|e| {
            let n = e.file_name().to_string_lossy().into_owned();
            n.starts_with(&stem) && n.contains(".corrupt")
        });
        assert!(backed_up, "expected a .corrupt backup of the unparseable state file");
    }

    #[test]
    fn save_tunnel_rejects_zero_local_port() {
        let store = Store::load(temp_path()).unwrap();
        let h = store.save_host(sample_host()).unwrap();
        let t = Tunnel {
            id: Uuid::nil(), name: "t".into(), kind: TunnelType::L, local_port: 0,
            bind_address: None, remote_host: Some("db".into()), remote_port: Some(5432),
            host_id: h.id, keep_alive: true, auto_start: false,
            status: TunnelStatus::Idle, started_at: None, last_error: None,
        };
        assert!(store.save_tunnel(t).is_err());
    }

    #[test]
    fn set_host_status_persists_latency() {
        let path = temp_path();
        let id = {
            let store = Store::load(path.clone()).unwrap();
            let h = store.save_host(sample_host()).unwrap();
            store.set_host_status(h.id, HostStatus::Ok, Some(42), None).unwrap();
            h.id
        };
        // reload from disk — latency must survive
        let reloaded = Store::load(path).unwrap();
        let h = reloaded.get_host(id).unwrap();
        assert_eq!(h.last_latency_ms, Some(42));
        assert_eq!(h.status, HostStatus::Ok);
    }

    #[test]
    fn delete_host_blocked_while_referenced_then_allowed() {
        let store = Store::load(temp_path()).unwrap();
        let h = store.save_host(sample_host()).unwrap();
        let t = store.save_tunnel(Tunnel {
            id: Uuid::nil(), name: "t".into(), kind: TunnelType::L, local_port: 5432,
            bind_address: None, remote_host: Some("db".into()), remote_port: Some(5432),
            host_id: h.id, keep_alive: true, auto_start: false,
            status: TunnelStatus::Idle, started_at: None, last_error: None,
        }).unwrap();
        assert!(store.delete_host(h.id).is_err(), "referenced host must not delete");
        store.delete_tunnel(t.id).unwrap();
        assert!(store.delete_host(h.id).is_ok(), "unreferenced host should delete");
    }
}

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
                Ok(text) => toml::from_str::<StateFile>(&text).unwrap_or_default(),
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

    /// Update host.status / last_error from a connectivity test result.
    /// Persists — these signals are useful across restarts ("which host
    /// failed last time?").
    pub fn set_host_status(
        &self,
        id: Uuid,
        status: HostStatus,
        last_error: Option<String>,
    ) -> AppResult<()> {
        {
            let mut hosts = self.hosts.write().unwrap();
            let Some(h) = hosts.iter_mut().find(|h| h.id == id) else {
                return Err(AppError::not_found("host"));
            };
            h.status = status;
            h.last_error = last_error;
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
        let referencing: Vec<String> = {
            self.tunnels.read().unwrap()
                .iter()
                .filter(|t| t.host_id == id)
                .map(|t| t.name.clone())
                .collect()
        };
        if !referencing.is_empty() {
            return Err(AppError::new(
                "host_in_use",
                format!("被以下隧道引用：{}", referencing.join(", ")),
            ));
        }
        {
            let mut hosts = self.hosts.write().unwrap();
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
        let text = toml::to_string_pretty(&snapshot)?;
        let tmp = self.path.with_extension("toml.tmp");
        std::fs::write(&tmp, text)?;
        std::fs::rename(&tmp, &self.path)?;
        Ok(())
    }
}

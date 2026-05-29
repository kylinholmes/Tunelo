use std::path::PathBuf;
use std::sync::RwLock;
use serde::{Serialize, Deserialize};

use crate::error::AppResult;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppSettings {
    #[serde(default)]
    pub ssh_path: Option<String>,
    #[serde(default)]
    pub ssh_config_path: Option<String>,
    #[serde(default)]
    pub auto_start_on_boot: bool,
    #[serde(default = "default_true")]
    pub auto_connect_on_boot: bool,
    #[serde(default = "default_true")]
    pub auto_sync_ssh_config: bool,
    #[serde(default = "default_true")]
    pub minimize_to_tray_on_close: bool,
    /// Bearer token required for HTTP API access when running with
    /// `--web`. Empty means "no auth"; only allowed when bound to a
    /// loopback address (enforced at startup in web/server.rs).
    #[serde(default)]
    pub web_secret: Option<String>,
}

fn default_true() -> bool { true }

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            ssh_path: detect_ssh_path(),
            ssh_config_path: detect_ssh_config_path(),
            auto_start_on_boot: false,
            auto_connect_on_boot: true,
            auto_sync_ssh_config: true,
            minimize_to_tray_on_close: true,
            web_secret: None,
        }
    }
}

fn detect_ssh_path() -> Option<String> {
    #[cfg(target_os = "windows")]
    {
        let candidate = r"C:\Windows\System32\OpenSSH\ssh.exe";
        if std::path::Path::new(candidate).exists() {
            return Some(candidate.to_string());
        }
        which("ssh.exe")
    }
    #[cfg(not(target_os = "windows"))]
    {
        which("ssh")
    }
}

fn which(name: &str) -> Option<String> {
    let path_env = std::env::var_os("PATH")?;
    for dir in std::env::split_paths(&path_env) {
        let candidate = dir.join(name);
        if candidate.is_file() {
            return candidate.to_str().map(|s| s.to_string());
        }
    }
    None
}

fn detect_ssh_config_path() -> Option<String> {
    let home = dirs::home_dir()?;
    let p = home.join(".ssh").join("config");
    Some(p.to_string_lossy().to_string())
}

pub struct SettingsStore {
    path: PathBuf,
    inner: RwLock<AppSettings>,
}

impl SettingsStore {
    pub fn load(path: PathBuf) -> AppResult<Self> {
        let initial = if path.exists() {
            match std::fs::read_to_string(&path) {
                Ok(text) => toml::from_str::<AppSettings>(&text).unwrap_or_default(),
                Err(_) => AppSettings::default(),
            }
        } else {
            AppSettings::default()
        };
        Ok(Self { path, inner: RwLock::new(initial) })
    }

    pub fn get(&self) -> AppSettings {
        self.inner.read().unwrap().clone()
    }

    pub fn save(&self, s: AppSettings) -> AppResult<AppSettings> {
        *self.inner.write().unwrap() = s.clone();
        if let Some(parent) = self.path.parent() {
            std::fs::create_dir_all(parent)?;
        }
        let text = toml::to_string_pretty(&s)?;
        let tmp = self.path.with_extension("toml.tmp");
        std::fs::write(&tmp, text)?;
        std::fs::rename(&tmp, &self.path)?;
        Ok(s)
    }

    /// Re-runs ssh path detection and updates the settings if the currently
    /// stored path is missing or doesn't point at a real file. Called once
    /// at boot from `lib::run`.
    pub fn auto_detect_paths(&self) -> AppResult<()> {
        let current = self.get();
        let mut next = current.clone();
        let mut changed = false;

        if !path_is_valid_file(&current.ssh_path) {
            if let Some(p) = detect_ssh_path() {
                next.ssh_path = Some(p);
                changed = true;
            }
        }
        if !path_is_valid_file(&current.ssh_config_path) {
            if let Some(p) = detect_ssh_config_path() {
                next.ssh_config_path = Some(p);
                changed = true;
            }
        }

        if changed {
            self.save(next)?;
        }
        Ok(())
    }
}

fn path_is_valid_file(p: &Option<String>) -> bool {
    match p {
        Some(s) if !s.trim().is_empty() => std::path::Path::new(s).is_file(),
        _ => false,
    }
}

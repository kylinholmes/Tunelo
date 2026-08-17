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
    #[serde(default = "default_true")]
    pub auto_connect_on_boot: bool,
    #[serde(default = "default_true")]
    pub minimize_to_tray_on_close: bool,
    /// Bearer token required for HTTP API access when running with
    /// `--web`. Empty means "no auth"; only allowed when bound to a
    /// loopback address (enforced at startup in web/server.rs).
    #[serde(default)]
    pub web_secret: Option<String>,
    /// UI theme id — a built-in id or the id of one of `custom_themes`.
    /// None = app default. The frontend owns the id space.
    #[serde(default)]
    pub theme: Option<String>,
    /// User-defined colour schemes (Windows Terminal scheme JSON plus
    /// id/name). Stored opaque so the frontend can evolve the format
    /// without a Rust change; only string values are expected.
    #[serde(default)]
    pub custom_themes: Vec<serde_json::Value>,
}

fn default_true() -> bool { true }

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            ssh_path: detect_ssh_path(),
            ssh_config_path: detect_ssh_config_path(),
            auto_connect_on_boot: true,
            minimize_to_tray_on_close: true,
            web_secret: None,
            theme: None,
            custom_themes: Vec::new(),
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn custom_themes_round_trip_through_toml() {
        let mut s = AppSettings::default();
        s.theme = Some("custom-abc".into());
        s.custom_themes = vec![serde_json::json!({
            "id": "custom-abc", "name": "Mine", "accent": "blue",
            "background": "#1a1b26", "foreground": "#c0caf5",
            "black": "#15161e", "red": "#f7768e", "green": "#9ece6a", "yellow": "#e0af68",
            "blue": "#7aa2f7", "purple": "#bb9af7", "cyan": "#7dcfff", "white": "#a9b1d6",
            "brightBlack": "#414868", "brightRed": "#f7768e", "brightGreen": "#9ece6a", "brightYellow": "#e0af68",
            "brightBlue": "#7aa2f7", "brightPurple": "#bb9af7", "brightCyan": "#7dcfff", "brightWhite": "#c0caf5"
        })];
        let text = toml::to_string_pretty(&s).expect("serialize");
        assert!(text.contains("[[custom_themes]]"), "{text}");
        let back: AppSettings = toml::from_str(&text).expect("deserialize");
        assert_eq!(back.theme.as_deref(), Some("custom-abc"));
        assert_eq!(back.custom_themes, s.custom_themes);
    }

    #[test]
    fn old_settings_without_theme_fields_still_load() {
        let text = "auto_connect_on_boot = false
minimize_to_tray_on_close = true
";
        let s: AppSettings = toml::from_str(text).expect("deserialize");
        assert!(s.theme.is_none());
        assert!(s.custom_themes.is_empty());
        assert!(!s.auto_connect_on_boot);
    }
}

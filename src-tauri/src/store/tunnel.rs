use serde::{Serialize, Deserialize};
use uuid::Uuid;

// L/R/D serialize as their letter form ("L", "R", "D") — matches the frontend.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
pub enum TunnelType {
    L,
    R,
    D,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum TunnelStatus {
    Idle,
    Connecting,
    Connected,
    Reconnecting,
    Failed,
    Stopping,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Tunnel {
    #[serde(default)]
    pub id: Uuid,
    pub name: String,
    #[serde(rename = "type")]
    pub kind: TunnelType,
    pub local_port: u16,
    /// Bind address for `-L` / `-R` / `-D`. None = 127.0.0.1 (loopback
    /// only). Use "0.0.0.0" to expose the local forward on all interfaces.
    #[serde(default)]
    pub bind_address: Option<String>,
    #[serde(default)]
    pub remote_host: Option<String>,
    #[serde(default)]
    pub remote_port: Option<u16>,
    pub host_id: Uuid,
    #[serde(default = "default_true")]
    pub keep_alive: bool,
    #[serde(default)]
    pub auto_start: bool,
    #[serde(default = "default_status")]
    pub status: TunnelStatus,
    #[serde(default)]
    pub started_at: Option<i64>,
    #[serde(default)]
    pub last_error: Option<String>,
}

fn default_true() -> bool { true }
fn default_status() -> TunnelStatus { TunnelStatus::Idle }

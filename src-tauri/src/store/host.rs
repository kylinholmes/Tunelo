use serde::{Serialize, Deserialize};
use uuid::Uuid;

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum HostSource {
    Config,
    Manual,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum HostStatus {
    Unknown,
    Ok,
    Fail,
    Checking,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Host {
    #[serde(default)]
    pub id: Uuid,
    pub alias: String,
    pub hostname: String,
    #[serde(default = "default_ssh_port")]
    pub port: u16,
    pub user: String,
    #[serde(default)]
    pub identity_file: Option<String>,
    #[serde(default)]
    pub proxy_jump: Option<Uuid>,
    #[serde(default = "default_source")]
    pub source: HostSource,
    #[serde(default = "default_status")]
    pub status: HostStatus,
    #[serde(default)]
    pub last_error: Option<String>,
}

fn default_ssh_port() -> u16 { 22 }
fn default_source() -> HostSource { HostSource::Manual }
fn default_status() -> HostStatus { HostStatus::Unknown }

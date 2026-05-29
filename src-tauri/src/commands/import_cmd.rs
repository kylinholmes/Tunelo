use std::sync::Arc;

use tauri::State;

use crate::core::AppContext;
use crate::error::AppResult;
use crate::ssh::import::{self, HostCandidate, TunnelCandidate};
use crate::store::{Host, Tunnel};

#[tauri::command]
pub fn parse_ssh_config_hosts(ctx: State<'_, Arc<AppContext>>) -> AppResult<Vec<HostCandidate>> {
    import::parse_hosts(&ctx)
}

#[tauri::command]
pub fn parse_ssh_config_tunnels(ctx: State<'_, Arc<AppContext>>) -> AppResult<Vec<TunnelCandidate>> {
    import::parse_tunnels(&ctx)
}

#[tauri::command]
pub fn import_hosts(
    ctx: State<'_, Arc<AppContext>>,
    candidates: Vec<HostCandidate>,
) -> AppResult<Vec<Host>> {
    import::import_hosts(&ctx, candidates)
}

#[tauri::command]
pub fn import_tunnels(
    ctx: State<'_, Arc<AppContext>>,
    candidates: Vec<TunnelCandidate>,
) -> AppResult<Vec<Tunnel>> {
    import::import_tunnels(&ctx, candidates)
}

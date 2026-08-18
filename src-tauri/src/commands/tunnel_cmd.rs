use std::sync::Arc;
use tauri::State;
use uuid::Uuid;

use crate::core::{AppContext, AppEvent};
use crate::error::AppResult;
use crate::store::Tunnel;

/// Recent activity (newest first) for the dashboard timeline.
#[tauri::command]
pub fn list_events(ctx: State<'_, Arc<AppContext>>, limit: Option<usize>) -> AppResult<Vec<AppEvent>> {
    Ok(ctx.events.recent(limit.unwrap_or(50)))
}

#[tauri::command]
pub fn list_tunnels(ctx: State<'_, Arc<AppContext>>) -> AppResult<Vec<Tunnel>> {
    Ok(ctx.store.list_tunnels())
}

#[tauri::command]
pub fn save_tunnel(ctx: State<'_, Arc<AppContext>>, tunnel: Tunnel) -> AppResult<Tunnel> {
    ctx.store.save_tunnel(tunnel)
}

#[tauri::command]
pub fn delete_tunnel(ctx: State<'_, Arc<AppContext>>, id: Uuid) -> AppResult<()> {
    ctx.store.delete_tunnel(id)
}

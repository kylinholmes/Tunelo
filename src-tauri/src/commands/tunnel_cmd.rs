use std::sync::Arc;
use tauri::State;
use uuid::Uuid;

use crate::core::AppContext;
use crate::error::AppResult;
use crate::store::Tunnel;

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

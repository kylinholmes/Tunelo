use tauri::State;
use uuid::Uuid;

use crate::AppState;
use crate::error::AppResult;
use crate::store::Tunnel;

#[tauri::command]
pub fn list_tunnels(state: State<'_, AppState>) -> AppResult<Vec<Tunnel>> {
    Ok(state.store.list_tunnels())
}

#[tauri::command]
pub fn save_tunnel(state: State<'_, AppState>, tunnel: Tunnel) -> AppResult<Tunnel> {
    state.store.save_tunnel(tunnel)
}

#[tauri::command]
pub fn delete_tunnel(state: State<'_, AppState>, id: Uuid) -> AppResult<()> {
    state.store.delete_tunnel(id)
}

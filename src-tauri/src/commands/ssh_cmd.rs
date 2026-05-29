use std::sync::Arc;
use tauri::State;
use uuid::Uuid;

use crate::core::AppContext;
use crate::error::AppResult;

#[tauri::command]
pub fn start_tunnel(ctx: State<'_, Arc<AppContext>>, id: Uuid) -> AppResult<()> {
    ctx.supervisor.start(id, ctx.inner().clone())
}

#[tauri::command]
pub async fn stop_tunnel(ctx: State<'_, Arc<AppContext>>, id: Uuid) -> AppResult<()> {
    ctx.supervisor.stop(id).await
}

#[tauri::command]
pub async fn restart_tunnel(ctx: State<'_, Arc<AppContext>>, id: Uuid) -> AppResult<()> {
    ctx.supervisor.restart(id, ctx.inner().clone()).await
}

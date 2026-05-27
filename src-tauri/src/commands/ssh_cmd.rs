use tauri::{AppHandle, State};
use uuid::Uuid;

use crate::error::AppResult;
use crate::ssh::Supervisor;

#[tauri::command]
pub fn start_tunnel(
    supervisor: State<'_, Supervisor>,
    app: AppHandle,
    id: Uuid,
) -> AppResult<()> {
    supervisor.start(id, app)
}

#[tauri::command]
pub async fn stop_tunnel(
    supervisor: State<'_, Supervisor>,
    id: Uuid,
) -> AppResult<()> {
    supervisor.stop(id).await
}

#[tauri::command]
pub async fn restart_tunnel(
    supervisor: State<'_, Supervisor>,
    app: AppHandle,
    id: Uuid,
) -> AppResult<()> {
    supervisor.restart(id, app).await
}

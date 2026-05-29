use std::sync::Arc;

use tauri::State;
use uuid::Uuid;

use crate::core::AppContext;
use crate::error::AppResult;
use crate::store::Host;

#[tauri::command]
pub fn list_hosts(ctx: State<'_, Arc<AppContext>>) -> AppResult<Vec<Host>> {
    Ok(ctx.store.list_hosts())
}

#[tauri::command]
pub fn save_host(ctx: State<'_, Arc<AppContext>>, host: Host) -> AppResult<Host> {
    ctx.store.save_host(host)
}

#[tauri::command]
pub fn delete_host(ctx: State<'_, Arc<AppContext>>, id: Uuid) -> AppResult<()> {
    ctx.store.delete_host(id)
}

#[tauri::command]
pub async fn test_host(
    ctx: State<'_, Arc<AppContext>>,
    id: Uuid,
    deep: bool,
) -> AppResult<crate::ssh::host_test::TestResult> {
    crate::ssh::host_test::test_host(&ctx, id, deep).await
}

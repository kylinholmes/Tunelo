use std::sync::Arc;
use tauri::State;

use crate::core::AppContext;
use crate::config::AppSettings;
use crate::error::AppResult;

#[tauri::command]
pub fn get_settings(ctx: State<'_, Arc<AppContext>>) -> AppResult<AppSettings> {
    Ok(ctx.settings.get())
}

#[tauri::command]
pub fn save_settings(
    ctx: State<'_, Arc<AppContext>>,
    settings: AppSettings,
) -> AppResult<AppSettings> {
    let saved = ctx.settings.save(settings)?;
    let payload = serde_json::to_value(&saved).unwrap_or(serde_json::Value::Null);
    ctx.sink.emit("settings:changed", payload);
    Ok(saved)
}

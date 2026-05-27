use tauri::{AppHandle, Emitter, State};

use crate::AppState;
use crate::config::AppSettings;
use crate::error::AppResult;

#[tauri::command]
pub fn get_settings(state: State<'_, AppState>) -> AppResult<AppSettings> {
    Ok(state.settings.get())
}

#[tauri::command]
pub fn save_settings(
    state: State<'_, AppState>,
    app: AppHandle,
    settings: AppSettings,
) -> AppResult<AppSettings> {
    let saved = state.settings.save(settings)?;
    let _ = app.emit("settings:changed", &saved);
    Ok(saved)
}

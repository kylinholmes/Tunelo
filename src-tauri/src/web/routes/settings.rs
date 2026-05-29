use std::sync::Arc;

use axum::{extract::State, Json};

use crate::config::AppSettings;
use crate::core::AppContext;
use crate::error::AppResult;

pub async fn get(State(ctx): State<Arc<AppContext>>) -> AppResult<Json<AppSettings>> {
    Ok(Json(ctx.settings.get()))
}

pub async fn save(
    State(ctx): State<Arc<AppContext>>,
    Json(s): Json<AppSettings>,
) -> AppResult<Json<AppSettings>> {
    let saved = ctx.settings.save(s)?;
    let payload = serde_json::to_value(&saved).unwrap_or(serde_json::Value::Null);
    ctx.sink.emit("settings:changed", payload);
    Ok(Json(saved))
}

use std::sync::Arc;

use axum::{extract::State, Json};

use crate::config::AppSettings;
use crate::core::AppContext;
use crate::error::AppResult;

pub async fn get(State(ctx): State<Arc<AppContext>>) -> AppResult<Json<AppSettings>> {
    // Never expose the bearer secret over the API — it is the very credential
    // used to reach this endpoint. Manage it via CLI / settings.toml.
    let mut s = ctx.settings.get();
    s.web_secret = None;
    Ok(Json(s))
}

pub async fn save(
    State(ctx): State<Arc<AppContext>>,
    Json(mut s): Json<AppSettings>,
) -> AppResult<Json<AppSettings>> {
    // A web client must not be able to read OR change the secret. Force the
    // incoming value back to the stored one so it can't be cleared (which would
    // silently disable auth on the next start) or rotated remotely.
    s.web_secret = ctx.settings.get().web_secret;
    let saved = ctx.settings.save(s)?;
    let mut redacted = saved.clone();
    redacted.web_secret = None;
    let payload = serde_json::to_value(&redacted).unwrap_or(serde_json::Value::Null);
    ctx.sink.emit("settings:changed", payload);
    Ok(Json(redacted))
}

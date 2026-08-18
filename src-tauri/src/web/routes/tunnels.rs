use std::sync::Arc;

use axum::{
    extract::{Path, Query, State},
    Json,
};
use uuid::Uuid;

use crate::core::{AppContext, AppEvent};
use crate::error::AppResult;
use crate::store::Tunnel;

pub async fn list(State(ctx): State<Arc<AppContext>>) -> AppResult<Json<Vec<Tunnel>>> {
    Ok(Json(ctx.store.list_tunnels()))
}

#[derive(serde::Deserialize)]
pub struct RecentQuery { pub limit: Option<usize> }

/// GET /api/events/recent?limit=50 — newest first.
pub async fn recent_events(
    State(ctx): State<Arc<AppContext>>,
    Query(q): Query<RecentQuery>,
) -> AppResult<Json<Vec<AppEvent>>> {
    Ok(Json(ctx.events.recent(q.limit.unwrap_or(50))))
}

pub async fn save(
    State(ctx): State<Arc<AppContext>>,
    Json(tunnel): Json<Tunnel>,
) -> AppResult<Json<Tunnel>> {
    Ok(Json(ctx.store.save_tunnel(tunnel)?))
}

pub async fn delete(
    State(ctx): State<Arc<AppContext>>,
    Path(id): Path<Uuid>,
) -> AppResult<()> {
    ctx.store.delete_tunnel(id)
}

pub async fn start(
    State(ctx): State<Arc<AppContext>>,
    Path(id): Path<Uuid>,
) -> AppResult<()> {
    ctx.supervisor.start(id, ctx.clone())
}

pub async fn stop(
    State(ctx): State<Arc<AppContext>>,
    Path(id): Path<Uuid>,
) -> AppResult<()> {
    ctx.supervisor.stop(id).await
}

pub async fn restart(
    State(ctx): State<Arc<AppContext>>,
    Path(id): Path<Uuid>,
) -> AppResult<()> {
    ctx.supervisor.restart(id, ctx.clone()).await
}

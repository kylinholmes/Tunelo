use std::sync::Arc;

use axum::{
    extract::{Path, State},
    Json,
};
use uuid::Uuid;

use crate::core::AppContext;
use crate::error::AppResult;
use crate::store::Host;

pub async fn list(State(ctx): State<Arc<AppContext>>) -> AppResult<Json<Vec<Host>>> {
    Ok(Json(ctx.store.list_hosts()))
}

pub async fn save(
    State(ctx): State<Arc<AppContext>>,
    Json(host): Json<Host>,
) -> AppResult<Json<Host>> {
    Ok(Json(ctx.store.save_host(host)?))
}

pub async fn delete(
    State(ctx): State<Arc<AppContext>>,
    Path(id): Path<Uuid>,
) -> AppResult<()> {
    ctx.store.delete_host(id)
}

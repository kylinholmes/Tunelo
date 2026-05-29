use std::sync::Arc;

use axum::{
    extract::{Path, Query, State},
    Json,
};
use serde::Deserialize;
use uuid::Uuid;

use crate::core::AppContext;
use crate::error::AppResult;
use crate::ssh::host_test::{self, TestResult};
use crate::ssh::import::{self, HostCandidate, TunnelCandidate};
use crate::store::{Host, Tunnel};

pub async fn parse_hosts(
    State(ctx): State<Arc<AppContext>>,
) -> AppResult<Json<Vec<HostCandidate>>> {
    Ok(Json(import::parse_hosts(&ctx)?))
}

pub async fn parse_tunnels(
    State(ctx): State<Arc<AppContext>>,
) -> AppResult<Json<Vec<TunnelCandidate>>> {
    Ok(Json(import::parse_tunnels(&ctx)?))
}

pub async fn import_hosts(
    State(ctx): State<Arc<AppContext>>,
    Json(candidates): Json<Vec<HostCandidate>>,
) -> AppResult<Json<Vec<Host>>> {
    Ok(Json(import::import_hosts(&ctx, candidates)?))
}

pub async fn import_tunnels(
    State(ctx): State<Arc<AppContext>>,
    Json(candidates): Json<Vec<TunnelCandidate>>,
) -> AppResult<Json<Vec<Tunnel>>> {
    Ok(Json(import::import_tunnels(&ctx, candidates)?))
}

#[derive(Deserialize)]
pub struct TestQuery {
    #[serde(default)]
    pub deep: bool,
}

pub async fn test_host(
    State(ctx): State<Arc<AppContext>>,
    Path(id): Path<Uuid>,
    Query(q): Query<TestQuery>,
) -> AppResult<Json<TestResult>> {
    Ok(Json(host_test::test_host(&ctx, id, q.deep).await?))
}

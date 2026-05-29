// src-tauri/src/ssh/host_test.rs
// Framework-agnostic SSH reachability test. commands/host_cmd.rs (Tauri)
// and web/routes/import.rs (HTTP) both delegate here.

use serde::Serialize;
use uuid::Uuid;

use crate::core::AppContext;
use crate::error::{AppError, AppResult};
use crate::ssh::{command, probe};
use crate::store::HostStatus;

#[derive(Debug, Serialize)]
pub struct TestResult {
    pub ok: bool,
    pub latency_ms: Option<u32>,
    pub error: Option<String>,
}

#[derive(Serialize, Clone)]
struct HostStatusPayload {
    id: Uuid,
    status: HostStatus,
    last_error: Option<String>,
}

fn emit(ctx: &AppContext, id: Uuid, status: HostStatus, last_error: Option<String>) {
    let payload = serde_json::to_value(HostStatusPayload { id, status, last_error })
        .unwrap_or(serde_json::Value::Null);
    ctx.sink.emit("host:status-changed", payload);
}

/// Test SSH reachability for a host. `deep=false` does a TCP connect to
/// host:port; `deep=true` spawns `ssh ... exit` which exercises auth +
/// proxy chain.
pub async fn test_host(ctx: &AppContext, id: Uuid, deep: bool) -> AppResult<TestResult> {
    let host = ctx.store.get_host(id).ok_or_else(|| AppError::not_found("host"))?;

    let _ = ctx.store.set_host_status(id, HostStatus::Checking, None);
    emit(ctx, id, HostStatus::Checking, None);

    let result: Result<u32, String> = if deep {
        let settings = ctx.settings.get();
        let ssh_path = match settings.ssh_path {
            Some(p) if !p.trim().is_empty() => p,
            _ => {
                let msg = "ssh 可执行路径未配置".to_string();
                let _ = ctx.store.set_host_status(id, HostStatus::Fail, Some(msg.clone()));
                emit(ctx, id, HostStatus::Fail, Some(msg.clone()));
                return Ok(TestResult { ok: false, latency_ms: None, error: Some(msg) });
            }
        };
        let all_hosts = ctx.store.list_hosts();
        let args = command::build_test_args(&host, &all_hosts);
        probe::ssh_test(&ssh_path, &args, 8000).await
    } else {
        let hostname = host.hostname.clone();
        let port = host.port;
        tokio::task::spawn_blocking(move || probe::quick_tcp_test(&hostname, port, 3000))
            .await
            .unwrap_or_else(|e| Err(format!("test 任务取消: {}", e)))
    };

    let (status, last_error, latency) = match &result {
        Ok(ms) => (HostStatus::Ok, None, Some(*ms)),
        Err(e) => (HostStatus::Fail, Some(e.clone()), None),
    };
    let _ = ctx.store.set_host_status(id, status, last_error.clone());
    emit(ctx, id, status, last_error.clone());

    Ok(TestResult {
        ok: result.is_ok(),
        latency_ms: latency,
        error: result.err(),
    })
}

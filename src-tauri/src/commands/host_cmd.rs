use serde::Serialize;
use tauri::{AppHandle, Emitter, State};
use uuid::Uuid;

use crate::AppState;
use crate::error::{AppError, AppResult};
use crate::ssh::command;
use crate::ssh::probe;
use crate::store::{Host, HostStatus};

#[tauri::command]
pub fn list_hosts(state: State<'_, AppState>) -> AppResult<Vec<Host>> {
    Ok(state.store.list_hosts())
}

#[tauri::command]
pub fn save_host(state: State<'_, AppState>, host: Host) -> AppResult<Host> {
    state.store.save_host(host)
}

#[tauri::command]
pub fn delete_host(state: State<'_, AppState>, id: Uuid) -> AppResult<()> {
    state.store.delete_host(id)
}

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

fn emit_status(app: &AppHandle, id: Uuid, status: HostStatus, last_error: Option<String>) {
    let _ = app.emit("host:status-changed", HostStatusPayload {
        id, status, last_error,
    });
}

/// Test SSH reachability for a host. `deep=false` does a TCP connect to
/// host:port; `deep=true` spawns `ssh ... exit` which exercises auth +
/// proxy chain.
#[tauri::command]
pub async fn test_host(
    state: State<'_, AppState>,
    app: AppHandle,
    id: Uuid,
    deep: bool,
) -> AppResult<TestResult> {
    let host = state.store.get_host(id)
        .ok_or_else(|| AppError::not_found("host"))?;

    // optimistic checking emit so the UI can show a spinner
    let _ = state.store.set_host_status(id, HostStatus::Checking, None);
    emit_status(&app, id, HostStatus::Checking, None);

    let result: Result<u32, String> = if deep {
        let settings = state.settings.get();
        let ssh_path = match settings.ssh_path {
            Some(p) if !p.trim().is_empty() => p,
            _ => {
                let msg = "ssh 可执行路径未配置".to_string();
                let _ = state.store.set_host_status(id, HostStatus::Fail, Some(msg.clone()));
                emit_status(&app, id, HostStatus::Fail, Some(msg.clone()));
                return Ok(TestResult { ok: false, latency_ms: None, error: Some(msg) });
            }
        };
        let all_hosts = state.store.list_hosts();
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
    let _ = state.store.set_host_status(id, status, last_error.clone());
    emit_status(&app, id, status, last_error.clone());

    Ok(TestResult {
        ok: result.is_ok(),
        latency_ms: latency,
        error: result.err(),
    })
}

use std::collections::HashMap;
use std::sync::{Arc, Mutex};

use tokio::sync::mpsc;
use uuid::Uuid;

use crate::core::AppContext;
use crate::error::{AppError, AppResult};
use crate::ssh::runner::{Runner, RunnerCmd};

struct Handle {
    cmd_tx: mpsc::Sender<RunnerCmd>,
    /// Shared with the runner — current ssh child pid (None when no
    /// process is alive). Read by `kill_all_blocking` on app exit.
    child_pid: Arc<Mutex<Option<u32>>>,
}

#[derive(Default)]
pub struct Supervisor {
    // Arc so we can hand a clone to each spawned runner task — it removes
    // its own entry from the map when it exits naturally.
    handles: Arc<Mutex<HashMap<Uuid, Handle>>>,
}

impl Supervisor {
    pub fn new() -> Self {
        Self::default()
    }

    #[allow(dead_code)]
    pub fn is_running(&self, id: Uuid) -> bool {
        self.handles.lock().unwrap().contains_key(&id)
    }

    pub fn start(&self, tunnel_id: Uuid, ctx: Arc<AppContext>) -> AppResult<()> {
        let mut handles = self.handles.lock().unwrap();
        if handles.contains_key(&tunnel_id) {
            return Err(AppError::invalid("隧道已在运行"));
        }
        let (tx, rx) = mpsc::channel(4);
        let child_pid: Arc<Mutex<Option<u32>>> = Arc::new(Mutex::new(None));
        handles.insert(tunnel_id, Handle {
            cmd_tx: tx,
            child_pid: child_pid.clone(),
        });
        drop(handles);

        let handles_arc = self.handles.clone();
        let runner = Runner { tunnel_id, ctx, cmd_rx: rx, child_pid };
        crate::core::spawn(async move {
            runner.run().await;
            handles_arc.lock().unwrap().remove(&tunnel_id);
        });
        Ok(())
    }

    pub async fn stop(&self, tunnel_id: Uuid) -> AppResult<()> {
        // Take the sender out; runner will exit and the spawn-cleanup
        // will then no-op since the entry is already gone.
        let tx = self.handles.lock().unwrap().remove(&tunnel_id).map(|h| h.cmd_tx);
        if let Some(tx) = tx {
            let _ = tx.send(RunnerCmd::Stop).await;
        }
        Ok(())
    }

    pub async fn restart(&self, tunnel_id: Uuid, ctx: Arc<AppContext>) -> AppResult<()> {
        let tx = self.handles.lock().unwrap().get(&tunnel_id).map(|h| h.cmd_tx.clone());
        match tx {
            Some(tx) => {
                let _ = tx.send(RunnerCmd::Restart).await;
                Ok(())
            }
            None => self.start(tunnel_id, ctx),
        }
    }

    /// Best-effort shutdown — send Stop to every active runner. Used on
    /// app exit; we don't wait for runners to finish.
    #[allow(dead_code)]
    pub async fn stop_all(&self) {
        let senders: Vec<_> = {
            let mut handles = self.handles.lock().unwrap();
            handles.drain().map(|(_, h)| h.cmd_tx).collect()
        };
        for tx in senders {
            let _ = tx.send(RunnerCmd::Stop).await;
        }
    }

    /// Synchronous force-kill of every running ssh child. Called from
    /// the Tauri RunEvent::ExitRequested handler — that hook runs on the
    /// main event loop thread and we can't await there, so we shell out
    /// to the OS killer for each PID.
    pub fn kill_all_blocking(&self) {
        let pids: Vec<u32> = {
            let h = self.handles.lock().unwrap();
            h.values()
                .filter_map(|x| *x.child_pid.lock().unwrap())
                .collect()
        };
        for pid in pids {
            kill_pid(pid);
        }
        // Clear handles map so any racing reads see an empty supervisor.
        self.handles.lock().unwrap().clear();
    }
}

/// Force-kill a process by pid, cross-platform. Shells out rather than
/// pulling in libc / windows-sys for a one-shot kill.
fn kill_pid(pid: u32) {
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        // /F = force, /T = also kill child process tree
        let _ = std::process::Command::new("taskkill")
            .args(["/F", "/T", "/PID", &pid.to_string()])
            .creation_flags(CREATE_NO_WINDOW)
            .output();
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = std::process::Command::new("kill")
            .args(["-9", &pid.to_string()])
            .output();
    }
}

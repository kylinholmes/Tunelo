use std::collections::HashMap;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};

use tokio::sync::mpsc;
use uuid::Uuid;

use crate::core::AppContext;
use crate::error::{AppError, AppResult};
use crate::ssh::runner::{Runner, RunnerCmd};

struct Handle {
    /// Monotonic token identifying this particular runner incarnation. The
    /// runner's self-cleanup only removes the map entry if it still carries
    /// *its* epoch — so a stale runner finishing its teardown can't delete a
    /// handle that a newer start() inserted for the same tunnel id.
    epoch: u64,
    cmd_tx: mpsc::Sender<RunnerCmd>,
    /// Shared with the runner — current ssh child pid (None when no process is
    /// alive). Read by `kill_all_blocking` on app exit.
    child_pid: Arc<Mutex<Option<u32>>>,
}

#[derive(Default)]
pub struct Supervisor {
    // Arc so we can hand a clone to each spawned runner task — it removes its
    // own entry from the map when it exits naturally.
    handles: Arc<Mutex<HashMap<Uuid, Handle>>>,
    // child_pids of runners that were removed from `handles` by stop() but
    // whose ssh child may still be alive until the runner finishes tearing
    // down. Keyed by epoch and scanned by kill_all_blocking, so an app exit
    // during that teardown window still reaps the child instead of orphaning
    // it. The runner removes its own entry here when it exits.
    reaping: Arc<Mutex<HashMap<u64, Arc<Mutex<Option<u32>>>>>>,
    next_epoch: Arc<AtomicU64>,
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
        let epoch = self.next_epoch.fetch_add(1, Ordering::Relaxed);
        let (tx, rx) = mpsc::channel(4);
        let child_pid: Arc<Mutex<Option<u32>>> = Arc::new(Mutex::new(None));
        handles.insert(tunnel_id, Handle {
            epoch,
            cmd_tx: tx,
            child_pid: child_pid.clone(),
        });
        drop(handles);

        let handles_arc = self.handles.clone();
        let reaping_arc = self.reaping.clone();
        let runner = Runner { tunnel_id, ctx, cmd_rx: rx, child_pid };
        crate::core::spawn(async move {
            runner.run().await;
            // Only remove our own incarnation — a newer start() may have
            // replaced the entry (with a higher epoch) while we were tearing
            // down; deleting it would orphan a live runner.
            {
                let mut handles = handles_arc.lock().unwrap();
                if handles.get(&tunnel_id).map_or(false, |h| h.epoch == epoch) {
                    handles.remove(&tunnel_id);
                }
            }
            reaping_arc.lock().unwrap().remove(&epoch);
        });
        Ok(())
    }

    pub async fn stop(&self, tunnel_id: Uuid) -> AppResult<()> {
        // Remove the handle so a fresh start() can take over immediately, but
        // park the child_pid in `reaping` so an app exit before the runner has
        // actually killed its ssh child still reaps it (the runner clears the
        // pid to None once the child is dead, and removes the entry on exit).
        let removed = self.handles.lock().unwrap().remove(&tunnel_id);
        if let Some(h) = removed {
            self.reaping.lock().unwrap().insert(h.epoch, h.child_pid.clone());
            let _ = h.cmd_tx.send(RunnerCmd::Stop).await;
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

    /// Best-effort shutdown — send Stop to every active runner. Used on app
    /// exit; we don't wait for runners to finish.
    #[allow(dead_code)]
    pub async fn stop_all(&self) {
        let senders: Vec<_> = {
            let mut handles = self.handles.lock().unwrap();
            let mut reaping = self.reaping.lock().unwrap();
            handles.drain().map(|(_, h)| {
                reaping.insert(h.epoch, h.child_pid.clone());
                h.cmd_tx
            }).collect()
        };
        for tx in senders {
            let _ = tx.send(RunnerCmd::Stop).await;
        }
    }

    /// Synchronous force-kill of every running ssh child. Called from the Tauri
    /// RunEvent::ExitRequested handler (and the web SIGTERM path) — that runs on
    /// the main event loop thread where we can't await, so we shell out to the
    /// OS killer for each PID. Scans both live handles and the reaping set so a
    /// child mid-teardown (already removed from `handles` by stop) is not missed.
    pub fn kill_all_blocking(&self) {
        let mut pids: Vec<u32> = {
            let h = self.handles.lock().unwrap();
            h.values()
                .filter_map(|x| *x.child_pid.lock().unwrap())
                .collect()
        };
        {
            let r = self.reaping.lock().unwrap();
            pids.extend(r.values().filter_map(|p| *p.lock().unwrap()));
        }
        for pid in pids {
            kill_pid(pid);
        }
        // Clear both maps so any racing reads see an empty supervisor.
        self.handles.lock().unwrap().clear();
        self.reaping.lock().unwrap().clear();
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

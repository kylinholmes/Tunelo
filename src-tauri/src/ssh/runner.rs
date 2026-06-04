// TunnelRunner — owns one ssh subprocess and its reconnect loop.
//
// State machine (simplified):
//   loop:
//     emit Connecting
//     spawn ssh
//     two-second probe window:
//       - process survived → emit Connected, attempt=0
//       - process exited early → if keep_alive: emit Reconnecting, sleep(backoff), continue
//                                else: emit Failed, break
//       - got user cmd → handle stop/restart
//     after connected, wait for either:
//       - user cmd (stop → kill+emit Idle; restart → kill+continue)
//       - process exit (same reconnect/fail logic as above)
//
// Reconnect backoff is fixed: 1s, 2s, 4s, 8s, ..., capped at 60s.

use std::process::Stdio;
use std::sync::{Arc, Mutex as StdMutex};
use std::time::Duration;

use serde::Serialize;
use tokio::io::AsyncBufReadExt;
use tokio::process::Command;
use tokio::sync::mpsc;
use uuid::Uuid;

use crate::core::AppContext;
use crate::ssh::{command, probe};
use crate::store::{TunnelStatus, TunnelType};

#[derive(Debug, Clone, Copy)]
pub enum RunnerCmd {
    Stop,
    Restart,
}

#[derive(Serialize, Clone)]
struct StatusPayload {
    id: Uuid,
    status: TunnelStatus,
    started_at: Option<i64>,
    last_error: Option<String>,
}

pub struct Runner {
    pub tunnel_id: Uuid,
    pub ctx: Arc<AppContext>,
    pub cmd_rx: mpsc::Receiver<RunnerCmd>,
    /// Lock-protected current child PID. The supervisor reads this on
    /// app exit to force-kill stragglers. None when no ssh process is
    /// alive for this runner.
    pub child_pid: Arc<StdMutex<Option<u32>>>,
}

impl Runner {
    pub async fn run(mut self) {
        let mut attempt: u32 = 0;
        loop {
            // Previous iteration's child is gone — clear so supervisor
            // doesn't try to kill a stale pid during shutdown.
            *self.child_pid.lock().unwrap() = None;

            // Re-snapshot tunnel + host each iteration — user may have
            // edited them between reconnects.
            let Some(tunnel) = self.ctx.store.get_tunnel(self.tunnel_id) else {
                // tunnel deleted while running — exit
                return;
            };
            let Some(host) = self.ctx.store.get_host(tunnel.host_id) else {
                self.emit(TunnelStatus::Failed, None, Some("依赖的主机已不存在".into()));
                return;
            };
            let settings = self.ctx.settings.get();
            let all_hosts = self.ctx.store.list_hosts();

            let ssh_path = match settings.ssh_path {
                Some(p) if !p.trim().is_empty() => p,
                _ => {
                    self.emit(TunnelStatus::Failed, None, Some("ssh 可执行路径未配置（Settings 页）".into()));
                    return;
                }
            };

            // pre-flight port check — friendlier than ssh's own failure msg.
            // Only meaningful for L/D where `local_port` is a *local* bind.
            // For R, `local_port` is the port the remote sshd will listen on;
            // binding it locally would falsely flag any port the user happens
            // to be using on this machine.
            if matches!(tunnel.kind, TunnelType::L | TunnelType::D) {
                let bind = tunnel.bind_address.as_deref().unwrap_or("127.0.0.1");
                if let Err(e) = probe::check_local_port_free(bind, tunnel.local_port) {
                    let msg = format!("本地端口 {} 被占用: {}", tunnel.local_port, e);
                    if !tunnel.keep_alive {
                        self.emit(TunnelStatus::Failed, None, Some(msg));
                        return;
                    }
                    attempt += 1;
                    self.emit(TunnelStatus::Reconnecting, None, Some(msg));
                    if !self.wait_or_cmd(backoff_delay(attempt)).await { return; }
                    continue;
                }
            }

            self.emit(TunnelStatus::Connecting, None, None);

            let args = command::build_args(&tunnel, &host, &all_hosts);
            let mut cmd = Command::new(&ssh_path);
            cmd.args(&args)
                .stdin(Stdio::null())
                .stdout(Stdio::null())
                .stderr(Stdio::piped());
            #[cfg(target_os = "windows")]
            {
                // suppress ssh console window on Windows. tokio's
                // process::Command exposes creation_flags directly on
                // Windows, no extension trait import needed.
                const CREATE_NO_WINDOW: u32 = 0x0800_0000;
                cmd.creation_flags(CREATE_NO_WINDOW);
            }

            let mut child = match cmd.spawn() {
                Ok(c) => c,
                Err(e) => {
                    let msg = format!("启动 ssh 失败: {}", e);
                    if !tunnel.keep_alive {
                        self.emit(TunnelStatus::Failed, None, Some(msg));
                        return;
                    }
                    attempt += 1;
                    self.emit(TunnelStatus::Reconnecting, None, Some(msg));
                    if !self.wait_or_cmd(backoff_delay(attempt)).await { return; }
                    continue;
                }
            };
            // Record the new child PID so the supervisor can reach it
            // synchronously during app shutdown.
            *self.child_pid.lock().unwrap() = child.id();

            // Drain stderr in background; keep only the last few lines for
            // error reporting on exit.
            let stderr_buf: Arc<StdMutex<Vec<String>>> = Arc::new(StdMutex::new(Vec::new()));
            if let Some(stderr) = child.stderr.take() {
                let buf = stderr_buf.clone();
                tokio::spawn(async move {
                    let reader = tokio::io::BufReader::new(stderr);
                    let mut lines = reader.lines();
                    while let Ok(Some(line)) = lines.next_line().await {
                        let mut b = buf.lock().unwrap();
                        b.push(line);
                        if b.len() > 20 { let drop_n = b.len() - 20; b.drain(..drop_n); }
                    }
                });
            }

            // Phase A — 2-second probe window: did ssh survive long enough
            // to consider the forward "up"?
            let probe_window = tokio::time::sleep(Duration::from_secs(2));
            tokio::pin!(probe_window);

            tokio::select! {
                _ = &mut probe_window => {
                    // survived → connected
                    attempt = 0;
                    self.emit(TunnelStatus::Connected, Some(now_ms()), None);
                }
                status = child.wait() => {
                    // child is dead — drop the pid immediately so a shutdown
                    // reaper can't target a recycled pid during the backoff.
                    *self.child_pid.lock().unwrap() = None;
                    let exit = describe_exit(&status);
                    let tail = stderr_tail(&stderr_buf);
                    let msg = format!("ssh 立即退出 ({}){}", exit, format_tail(&tail));
                    if !tunnel.keep_alive {
                        self.emit(TunnelStatus::Failed, None, Some(msg));
                        return;
                    }
                    attempt += 1;
                    self.emit(TunnelStatus::Reconnecting, None, Some(msg));
                    if !self.wait_or_cmd(backoff_delay(attempt)).await { return; }
                    continue;
                }
                cmd = self.cmd_rx.recv() => {
                    self.emit(TunnelStatus::Stopping, None, None);
                    let _ = child.start_kill();
                    let _ = child.wait().await;
                    *self.child_pid.lock().unwrap() = None;
                    match cmd {
                        Some(RunnerCmd::Stop) | None => {
                            self.emit(TunnelStatus::Idle, None, None);
                            return;
                        }
                        Some(RunnerCmd::Restart) => { attempt = 0; continue; }
                    }
                }
            }

            // Phase B — connected; wait for either external cmd or process exit
            tokio::select! {
                cmd = self.cmd_rx.recv() => {
                    self.emit(TunnelStatus::Stopping, None, None);
                    let _ = child.start_kill();
                    let _ = child.wait().await;
                    *self.child_pid.lock().unwrap() = None;
                    match cmd {
                        Some(RunnerCmd::Stop) | None => {
                            self.emit(TunnelStatus::Idle, None, None);
                            return;
                        }
                        Some(RunnerCmd::Restart) => { attempt = 0; continue; }
                    }
                }
                status = child.wait() => {
                    *self.child_pid.lock().unwrap() = None;
                    let exit = describe_exit(&status);
                    let tail = stderr_tail(&stderr_buf);
                    let msg = format!("ssh 退出 ({}){}", exit, format_tail(&tail));
                    if !tunnel.keep_alive {
                        self.emit(TunnelStatus::Failed, None, Some(msg));
                        return;
                    }
                    attempt += 1;
                    self.emit(TunnelStatus::Reconnecting, None, Some(msg));
                    if !self.wait_or_cmd(backoff_delay(attempt)).await { return; }
                    continue;
                }
            }
        }
    }

    /// Sleep for `delay`, or short-circuit on a command. Returns false if
    /// the runner should exit (got Stop or channel closed).
    async fn wait_or_cmd(&mut self, delay: Duration) -> bool {
        tokio::select! {
            _ = tokio::time::sleep(delay) => true,
            cmd = self.cmd_rx.recv() => match cmd {
                Some(RunnerCmd::Stop) | None => {
                    self.emit(TunnelStatus::Idle, None, None);
                    false
                }
                Some(RunnerCmd::Restart) => true,
            }
        }
    }

    fn emit(&self, status: TunnelStatus, started_at: Option<i64>, last_error: Option<String>) {
        let _ = self.ctx.store.update_runtime(self.tunnel_id, status, started_at, last_error.clone());
        let payload = serde_json::to_value(StatusPayload {
            id: self.tunnel_id,
            status,
            started_at,
            last_error,
        }).unwrap_or(serde_json::Value::Null);
        self.ctx.sink.emit("tunnel:status-changed", payload);
    }
}

fn backoff_delay(attempt: u32) -> Duration {
    // attempt=1 → 1s, 2→2s, 3→4s, …, capped at 60s
    let exp = attempt.saturating_sub(1).min(6);
    let secs = (1_u64 << exp).min(60);
    Duration::from_secs(secs)
}

fn describe_exit(status: &std::io::Result<std::process::ExitStatus>) -> String {
    match status {
        Ok(s) => match s.code() {
            Some(c) => format!("exit code {}", c),
            None => "信号终止".into(),
        },
        Err(e) => format!("等待失败: {}", e),
    }
}

fn stderr_tail(buf: &Arc<StdMutex<Vec<String>>>) -> Vec<String> {
    buf.lock().unwrap().clone()
}

fn format_tail(tail: &[String]) -> String {
    if tail.is_empty() { return String::new(); }
    let last = tail.iter().rev().find(|s| !s.trim().is_empty());
    match last {
        Some(s) => format!(" — {}", s.trim()),
        None => String::new(),
    }
}

fn now_ms() -> i64 {
    use std::time::{SystemTime, UNIX_EPOCH};
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

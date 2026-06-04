use std::time::{Duration, Instant};

// Pre-flight port conflict check. We try to bind `bind_addr:port` and release
// immediately — if bind fails the port is already in use on that interface and
// ssh will fail to set up the forward anyway, but this gives a friendlier error
// before we spawn the subprocess. We bind the SAME address the forward will use
// (e.g. 0.0.0.0 vs 127.0.0.1) so a 0.0.0.0 forward isn't checked against
// loopback only. This is a best-effort, racy pre-check (TOCTOU before ssh
// binds); ExitOnForwardFailure is the real guard.
pub fn check_local_port_free(bind_addr: &str, port: u16) -> Result<(), String> {
    let addr = if bind_addr.trim().is_empty() { "127.0.0.1" } else { bind_addr };
    match std::net::TcpListener::bind((addr, port)) {
        Ok(listener) => {
            drop(listener);
            Ok(())
        }
        Err(e) => Err(e.to_string()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn port_check_detects_in_use_port() {
        let l = std::net::TcpListener::bind(("127.0.0.1", 0)).unwrap();
        let port = l.local_addr().unwrap().port();
        assert!(check_local_port_free("127.0.0.1", port).is_err());
    }

    #[test]
    fn port_check_empty_bind_defaults_to_loopback() {
        let l = std::net::TcpListener::bind(("127.0.0.1", 0)).unwrap();
        let port = l.local_addr().unwrap().port();
        // empty bind addr must be treated as loopback, so the conflict is seen
        assert!(check_local_port_free("", port).is_err());
    }
}

/// Quick TCP test — DNS resolve + TcpStream::connect with timeout.
/// Returns elapsed ms on success. Catches DNS failures and timeouts
/// separately for clearer error messages.
pub fn quick_tcp_test(hostname: &str, port: u16, timeout_ms: u64) -> Result<u32, String> {
    use std::net::ToSocketAddrs;
    let start = Instant::now();
    let mut addrs = (hostname, port).to_socket_addrs()
        .map_err(|e| format!("DNS 解析失败: {}", e))?;
    let addr = addrs.next().ok_or_else(|| "无可用地址".to_string())?;
    std::net::TcpStream::connect_timeout(&addr, Duration::from_millis(timeout_ms))
        .map_err(|e| e.to_string())?;
    Ok(start.elapsed().as_millis() as u32)
}

/// Deep test — spawn `ssh ... exit` and observe whether the handshake
/// (including auth + proxy chain) succeeds. Returns elapsed ms on
/// success, stderr tail on failure.
pub async fn ssh_test(
    ssh_path: &str,
    args: &[String],
    timeout_ms: u64,
) -> Result<u32, String> {
    use std::process::Stdio;
    use tokio::io::AsyncReadExt;

    let start = Instant::now();
    let mut cmd = tokio::process::Command::new(ssh_path);
    cmd.args(args)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::piped());
    #[cfg(target_os = "windows")]
    {
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }

    let mut child = cmd.spawn().map_err(|e| format!("spawn ssh 失败: {}", e))?;
    let stderr = child.stderr.take();

    let wait_fut = child.wait();
    let timed = tokio::time::timeout(Duration::from_millis(timeout_ms), wait_fut).await;
    let status = match timed {
        Ok(s) => s.map_err(|e| format!("ssh 等待失败: {}", e))?,
        Err(_) => {
            let _ = child.start_kill();
            let _ = child.wait().await;
            return Err(format!("超时 ({}ms)", timeout_ms));
        }
    };

    if status.success() {
        return Ok(start.elapsed().as_millis() as u32);
    }

    // collect stderr tail for the error message
    let mut tail = String::new();
    if let Some(mut s) = stderr {
        let _ = s.read_to_string(&mut tail).await;
    }
    let last_line = tail.lines().rev().find(|l| !l.trim().is_empty()).unwrap_or("").trim();
    let code = status.code().map(|c| c.to_string()).unwrap_or_else(|| "signal".into());
    if last_line.is_empty() {
        Err(format!("ssh 退出 code={}", code))
    } else {
        Err(format!("{} (exit {})", last_line, code))
    }
}

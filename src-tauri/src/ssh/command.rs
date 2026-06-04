use crate::store::{Host, Tunnel, TunnelType};

/// Builds the argv for `ssh user@host exit` — used by the connectivity
/// test command. No `-N` and no forward args; otherwise the same auth/
/// proxy options as a real tunnel so a passing test predicts a working
/// tunnel.
pub fn build_test_args(host: &Host, all_hosts: &[Host]) -> Vec<String> {
    let mut args: Vec<String> = Vec::with_capacity(12);
    if let Some(id_file) = &host.identity_file {
        args.push("-i".into());
        args.push(expand_tilde(id_file));
    }
    args.push("-p".into());
    args.push(host.port.to_string());
    let chain = build_jump_chain(host, all_hosts);
    if !chain.is_empty() {
        args.push("-J".into());
        args.push(chain);
    }
    for opt in [
        "BatchMode=yes",
        // Real tunnels impose no ConnectTimeout; keep this generous so a
        // slow-but-working link isn't reported as unreachable. Bounded by the
        // outer wall-clock timeout in host_test.rs.
        "ConnectTimeout=10",
        "StrictHostKeyChecking=accept-new",
    ] {
        args.push("-o".into());
        args.push(opt.into());
    }
    args.push(format!("{}@{}", host.user, host.hostname));
    args.push("exit".into());
    args
}

/// Builds the argv (excluding ssh executable itself) for a tunnel.
///
/// ProxyJump chain semantics:
/// - `host.proxy_jump = A` means "to reach `host`, first ssh into A"
/// - if `A.proxy_jump = B`, then full path is client → B → A → host
/// - ssh `-J` expects hops left-to-right in the order the client traverses
///   them, so we emit "B,A" — we walk our chain from nearest-to-host
///   outward and reverse before joining.
pub fn build_args(tunnel: &Tunnel, host: &Host, all_hosts: &[Host]) -> Vec<String> {
    let mut args: Vec<String> = Vec::with_capacity(16);
    args.push("-N".into());

    // bind_address defaults to loopback. Only include it in the arg when
    // it's non-default so ssh's syntax stays minimal for the common case.
    // (For -R the bind is interpreted on the remote side and needs the
    // server's GatewayPorts, but the [bind:]port syntax is identical.)
    let bind = tunnel.bind_address.as_deref().filter(|s| !s.is_empty() && *s != "127.0.0.1");
    let bind_prefix = match bind {
        Some(addr) => format!("{}:{}", addr, tunnel.local_port),
        None => tunnel.local_port.to_string(),
    };
    match tunnel.kind {
        TunnelType::L => args.push(format!(
            "-L{}:{}:{}",
            bind_prefix,
            tunnel.remote_host.as_deref().unwrap_or(""),
            tunnel.remote_port.unwrap_or(0),
        )),
        TunnelType::R => args.push(format!(
            "-R{}:{}:{}",
            bind_prefix,
            tunnel.remote_host.as_deref().unwrap_or(""),
            tunnel.remote_port.unwrap_or(0),
        )),
        TunnelType::D => args.push(format!("-D{}", bind_prefix)),
    }

    if let Some(id_file) = &host.identity_file {
        let expanded = expand_tilde(id_file);
        args.push("-i".into());
        args.push(expanded);
    }

    args.push("-p".into());
    args.push(host.port.to_string());

    let chain = build_jump_chain(host, all_hosts);
    if !chain.is_empty() {
        args.push("-J".into());
        args.push(chain);
    }

    // baseline ssh options. BatchMode=yes makes ssh non-interactive (fails
    // fast on prompts). ExitOnForwardFailure ensures the process dies if the
    // forward couldn't be set up rather than silently surviving without it.
    for opt in [
        "BatchMode=yes",
        "ServerAliveInterval=30",
        "ServerAliveCountMax=3",
        "ExitOnForwardFailure=yes",
        "StrictHostKeyChecking=accept-new",
    ] {
        args.push("-o".into());
        args.push(opt.into());
    }

    args.push(format!("{}@{}", host.user, host.hostname));
    args
}

fn build_jump_chain(host: &Host, all_hosts: &[Host]) -> String {
    let mut chain: Vec<String> = Vec::new();
    let mut visited: Vec<uuid::Uuid> = vec![host.id];
    let mut cur = host.proxy_jump;
    while let Some(id) = cur {
        if visited.contains(&id) { break; }
        visited.push(id);
        let Some(h) = all_hosts.iter().find(|x| x.id == id) else { break };
        chain.push(format!("{}@{}:{}", h.user, h.hostname, h.port));
        cur = h.proxy_jump;
    }
    // reverse: outermost jump first (client connects to it first)
    chain.reverse();
    chain.join(",")
}

fn expand_tilde(path: &str) -> String {
    let Some(rest) = path.strip_prefix("~") else {
        return path.to_string();
    };
    // Only expand "~" and "~/..." (the current user's home). A "~user/..."
    // form refers to another user's home which we can't resolve — leave it
    // untouched so ssh can expand it itself rather than mangling it into the
    // current user's home.
    if rest.is_empty() || rest.starts_with('/') || rest.starts_with('\\') {
        if let Some(home) = dirs::home_dir() {
            let trimmed = rest.trim_start_matches(['/', '\\']);
            return home.join(trimmed).to_string_lossy().into_owned();
        }
    }
    path.to_string()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::store::{HostSource, HostStatus, TunnelStatus};
    use uuid::Uuid;

    fn host(alias: &str, user: &str, hostname: &str, port: u16, proxy_jump: Option<Uuid>) -> Host {
        Host {
            id: Uuid::new_v4(),
            alias: alias.into(),
            hostname: hostname.into(),
            port,
            user: user.into(),
            identity_file: None,
            proxy_jump,
            source: HostSource::Manual,
            status: HostStatus::Unknown,
            last_error: None,
            last_latency_ms: None,
        }
    }

    fn local_tunnel(host_id: Uuid) -> Tunnel {
        Tunnel {
            id: Uuid::new_v4(),
            name: "t".into(),
            kind: TunnelType::L,
            local_port: 5432,
            bind_address: None,
            remote_host: Some("db.internal".into()),
            remote_port: Some(5432),
            host_id,
            keep_alive: true,
            auto_start: false,
            status: TunnelStatus::Idle,
            started_at: None,
            last_error: None,
        }
    }

    #[test]
    fn local_forward_no_jump() {
        let h = host("h", "ops", "example.com", 22, None);
        let t = local_tunnel(h.id);
        let args = build_args(&t, &h, &[h.clone()]);
        assert!(args.contains(&"-N".to_string()));
        assert!(args.contains(&"-L5432:db.internal:5432".to_string()));
        assert!(args.contains(&"-p".to_string()));
        assert!(args.contains(&"22".to_string()));
        assert!(args.contains(&"ops@example.com".to_string()));
        // no -J
        assert!(!args.iter().any(|a| a == "-J"));
    }

    #[test]
    fn dynamic_forward() {
        let h = host("h", "root", "jp.example", 2222, None);
        let mut t = local_tunnel(h.id);
        t.kind = TunnelType::D;
        t.local_port = 1080;
        t.remote_host = None;
        t.remote_port = None;
        let args = build_args(&t, &h, &[h.clone()]);
        assert!(args.contains(&"-D1080".to_string()));
        assert!(args.contains(&"root@jp.example".to_string()));
    }

    #[test]
    fn bind_address_loopback_is_omitted() {
        let h = host("h", "u", "x", 22, None);
        let mut t = local_tunnel(h.id);
        t.bind_address = Some("127.0.0.1".into());
        let args = build_args(&t, &h, &[h.clone()]);
        assert!(args.contains(&"-L5432:db.internal:5432".to_string()));
        assert!(!args.iter().any(|a| a.contains("127.0.0.1:5432")));
    }

    #[test]
    fn bind_address_zero_includes_prefix() {
        let h = host("h", "u", "x", 22, None);
        let mut t = local_tunnel(h.id);
        t.bind_address = Some("0.0.0.0".into());
        let args = build_args(&t, &h, &[h.clone()]);
        assert!(args.contains(&"-L0.0.0.0:5432:db.internal:5432".to_string()));
    }

    #[test]
    fn bind_address_for_dynamic() {
        let h = host("h", "u", "x", 22, None);
        let mut t = local_tunnel(h.id);
        t.kind = TunnelType::D;
        t.local_port = 1080;
        t.remote_host = None;
        t.remote_port = None;
        t.bind_address = Some("0.0.0.0".into());
        let args = build_args(&t, &h, &[h.clone()]);
        assert!(args.contains(&"-D0.0.0.0:1080".to_string()));
    }

    #[test]
    fn test_args_for_host_no_forwards() {
        let h = host("h", "ops", "example.com", 2222, None);
        let args = build_test_args(&h, &[h.clone()]);
        assert!(args.contains(&"ops@example.com".to_string()));
        assert!(args.contains(&"2222".to_string()));
        assert!(args.contains(&"exit".to_string()));
        assert!(args.contains(&"ConnectTimeout=10".to_string()));
        assert!(args.contains(&"BatchMode=yes".to_string()));
        // no -N / -L / -D
        assert!(!args.iter().any(|a| a == "-N"));
        assert!(!args.iter().any(|a| a.starts_with("-L") || a.starts_with("-D") || a.starts_with("-R")));
    }

    #[test]
    fn expand_tilde_user_path_is_left_for_ssh() {
        // `~user` refers to *another* user's home — we cannot resolve it, and
        // must NOT rewrite it into the current user's home. Leave it for ssh.
        assert_eq!(expand_tilde("~bob/.ssh/id_ed25519"), "~bob/.ssh/id_ed25519");
    }

    #[test]
    fn expand_tilde_current_user_has_no_tilde() {
        if dirs::home_dir().is_some() {
            let got = expand_tilde("~/keys/id");
            assert!(!got.contains('~'), "tilde should be expanded, got {got}");
        }
    }

    #[test]
    fn proxy_jump_chain_is_outermost_first() {
        // client → B → A → target
        let b = host("B", "u", "b.example", 22, None);
        let a = host("A", "u", "a.example", 22, Some(b.id));
        let target = host("target", "u", "t.example", 22, Some(a.id));
        let t = local_tunnel(target.id);

        let args = build_args(&t, &target, &[b.clone(), a.clone(), target.clone()]);
        let jpos = args.iter().position(|a| a == "-J").expect("has -J");
        let chain = &args[jpos + 1];
        assert_eq!(chain, "u@b.example:22,u@a.example:22");
    }
}

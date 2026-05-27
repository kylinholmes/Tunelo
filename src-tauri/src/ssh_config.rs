// Minimal hand-rolled parser for OpenSSH `~/.ssh/config`. We deliberately
// stay simple: no `Include` resolution, no Match blocks, no Host wildcards
// (those are skipped). Just enough to extract concrete Hosts and their
// LocalForward / RemoteForward / DynamicForward declarations.

#[derive(Debug, Clone)]
pub struct ParsedHost {
    pub alias: String,
    pub hostname: Option<String>,
    pub port: Option<u16>,
    pub user: Option<String>,
    pub identity_file: Option<String>,
    pub proxy_jump_alias: Option<String>,
    pub forwards: Vec<ParsedForward>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ParsedForward {
    Local { local_port: u16, remote_host: String, remote_port: u16 },
    Remote { local_port: u16, remote_host: String, remote_port: u16 },
    Dynamic { local_port: u16 },
}

pub fn parse(content: &str) -> Vec<ParsedHost> {
    let mut hosts: Vec<ParsedHost> = Vec::new();
    let mut current: Option<ParsedHost> = None;

    for raw in content.lines() {
        let line = strip_comment(raw).trim();
        if line.is_empty() { continue; }

        let (key, value) = match split_key_value(line) {
            Some(kv) => kv,
            None => continue,
        };

        let key_lower = key.to_ascii_lowercase();
        if key_lower == "host" {
            // flush previous
            if let Some(h) = current.take() {
                push_if_concrete(&mut hosts, h);
            }
            // a Host line may list multiple aliases — take the first non-wildcard
            let alias = value
                .split_whitespace()
                .find(|a| !is_wildcard(a))
                .map(|s| s.to_string());
            if let Some(alias) = alias {
                current = Some(ParsedHost {
                    alias,
                    hostname: None,
                    port: None,
                    user: None,
                    identity_file: None,
                    proxy_jump_alias: None,
                    forwards: Vec::new(),
                });
            }
            continue;
        }

        // Match blocks aren't supported — we ignore directives that fall
        // outside a Host block (i.e. before the first `Host` line).
        let Some(h) = current.as_mut() else { continue };

        match key_lower.as_str() {
            "hostname" => h.hostname = Some(value.to_string()),
            "port" => h.port = value.parse().ok(),
            "user" => h.user = Some(value.to_string()),
            "identityfile" => {
                // a Host may list multiple IdentityFile lines; first one wins
                if h.identity_file.is_none() {
                    h.identity_file = Some(value.to_string());
                }
            }
            "proxyjump" => {
                // value form: "[user@]host[:port][,user@host[:port]...]"
                // take only the first hop's host part for matching
                let first_hop = value.split(',').next().unwrap_or("").trim();
                let after_user = first_hop.rsplit('@').next().unwrap_or("");
                let host_only = after_user.split(':').next().unwrap_or("");
                if !host_only.is_empty() {
                    h.proxy_jump_alias = Some(host_only.to_string());
                }
            }
            "localforward" => {
                if let Some(f) = parse_forward_lr(value, true) {
                    h.forwards.push(f);
                }
            }
            "remoteforward" => {
                if let Some(f) = parse_forward_lr(value, false) {
                    h.forwards.push(f);
                }
            }
            "dynamicforward" => {
                if let Some(p) = parse_bind_port(value) {
                    h.forwards.push(ParsedForward::Dynamic { local_port: p });
                }
            }
            _ => { /* ignore unknown keys */ }
        }
    }

    if let Some(h) = current.take() {
        push_if_concrete(&mut hosts, h);
    }

    hosts
}

fn is_wildcard(s: &str) -> bool {
    s.contains('*') || s.contains('?') || s.contains('!')
}

fn push_if_concrete(out: &mut Vec<ParsedHost>, h: ParsedHost) {
    if !is_wildcard(&h.alias) {
        out.push(h);
    }
}

fn strip_comment(line: &str) -> &str {
    match line.find('#') {
        Some(pos) => &line[..pos],
        None => line,
    }
}

// ssh_config keys can be separated from values by either whitespace or `=`.
// "Key value", "Key=value", "Key = value" all valid.
fn split_key_value(line: &str) -> Option<(&str, &str)> {
    // Find the first whitespace-or-`=` boundary.
    let bytes = line.as_bytes();
    let mut i = 0;
    while i < bytes.len() && !bytes[i].is_ascii_whitespace() && bytes[i] != b'=' {
        i += 1;
    }
    if i == 0 || i == bytes.len() {
        return None;
    }
    let key = &line[..i];
    // skip separator chars (whitespace and at most one '=')
    let mut j = i;
    let mut seen_eq = false;
    while j < bytes.len() {
        match bytes[j] {
            b' ' | b'\t' => j += 1,
            b'=' if !seen_eq => { seen_eq = true; j += 1; }
            _ => break,
        }
    }
    let value = line[j..].trim();
    if value.is_empty() { return None; }
    Some((key, value))
}

// "5432 host.internal:5432"
// "127.0.0.1:5432 host.internal:5432"
// "5432 host.internal 5432"
fn parse_forward_lr(value: &str, is_local: bool) -> Option<ParsedForward> {
    let parts: Vec<&str> = value.split_whitespace().collect();
    if parts.len() < 2 { return None; }

    let local_port = parse_bind_port(parts[0])?;

    // remote could be "host:port" (parts[1]) or "host" + "port" (parts[1] parts[2])
    let target = parts[1];
    let (remote_host, remote_port) = if let Some(idx) = target.rfind(':') {
        let host = target[..idx].to_string();
        let port: u16 = target[idx + 1..].parse().ok()?;
        if host.is_empty() { return None; }
        (host, port)
    } else if parts.len() >= 3 {
        let port: u16 = parts[2].parse().ok()?;
        (target.to_string(), port)
    } else {
        return None;
    };

    Some(if is_local {
        ParsedForward::Local { local_port, remote_host, remote_port }
    } else {
        ParsedForward::Remote { local_port, remote_host, remote_port }
    })
}

// Parses a `[bind_address:]port` form — we only need the port.
fn parse_bind_port(s: &str) -> Option<u16> {
    if let Some(idx) = s.rfind(':') {
        s[idx + 1..].parse().ok()
    } else {
        s.parse().ok()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_simple_host() {
        let cfg = r#"
            Host bastion
                HostName bastion.example.com
                User ops
                Port 2222
                IdentityFile ~/.ssh/id_ed25519
        "#;
        let h = &parse(cfg)[0];
        assert_eq!(h.alias, "bastion");
        assert_eq!(h.hostname.as_deref(), Some("bastion.example.com"));
        assert_eq!(h.user.as_deref(), Some("ops"));
        assert_eq!(h.port, Some(2222));
        assert_eq!(h.identity_file.as_deref(), Some("~/.ssh/id_ed25519"));
        assert!(h.forwards.is_empty());
    }

    #[test]
    fn parses_eq_form_and_comments() {
        let cfg = "Host=eqform\n  Port=22  # trailing comment\n  User = me\n";
        let h = &parse(cfg)[0];
        assert_eq!(h.alias, "eqform");
        assert_eq!(h.port, Some(22));
        assert_eq!(h.user.as_deref(), Some("me"));
    }

    #[test]
    fn skips_wildcard_hosts() {
        let cfg = "Host *\n  User shared\nHost real\n  HostName r.example\n";
        let parsed = parse(cfg);
        assert_eq!(parsed.len(), 1);
        assert_eq!(parsed[0].alias, "real");
    }

    #[test]
    fn first_non_wildcard_alias_wins() {
        let cfg = "Host real * other\n  HostName r.example\n";
        let parsed = parse(cfg);
        assert_eq!(parsed.len(), 1);
        assert_eq!(parsed[0].alias, "real");
    }

    #[test]
    fn parses_forwards() {
        let cfg = r#"
            Host db
                HostName db.example
                LocalForward 5432 db.internal:5432
                LocalForward 127.0.0.1:6379 cache:6379
                RemoteForward 2222 git:22
                DynamicForward 1080
                DynamicForward 127.0.0.1:1081
        "#;
        let h = &parse(cfg)[0];
        assert_eq!(h.forwards.len(), 5);
        assert_eq!(h.forwards[0], ParsedForward::Local { local_port: 5432, remote_host: "db.internal".into(), remote_port: 5432 });
        assert_eq!(h.forwards[1], ParsedForward::Local { local_port: 6379, remote_host: "cache".into(), remote_port: 6379 });
        assert_eq!(h.forwards[2], ParsedForward::Remote { local_port: 2222, remote_host: "git".into(), remote_port: 22 });
        assert_eq!(h.forwards[3], ParsedForward::Dynamic { local_port: 1080 });
        assert_eq!(h.forwards[4], ParsedForward::Dynamic { local_port: 1081 });
    }

    #[test]
    fn parses_proxy_jump_user_and_port_stripped() {
        let cfg = "Host inner\n  ProxyJump ops@bastion:2222\n";
        assert_eq!(parse(cfg)[0].proxy_jump_alias.as_deref(), Some("bastion"));
    }

    #[test]
    fn proxy_jump_takes_first_hop_only() {
        let cfg = "Host inner\n  ProxyJump bastion,gateway\n";
        assert_eq!(parse(cfg)[0].proxy_jump_alias.as_deref(), Some("bastion"));
    }

    #[test]
    fn skips_directives_before_first_host_block() {
        let cfg = "User leaked\nHost h\n  HostName foo\n";
        let h = &parse(cfg)[0];
        assert_eq!(h.alias, "h");
        assert_eq!(h.user, None);
    }
}

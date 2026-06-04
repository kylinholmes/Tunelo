// Minimal hand-rolled parser for OpenSSH `~/.ssh/config`. We deliberately
// stay simple: no `Include` resolution (referenced files are not pulled in).
// Match blocks are not honoured but they DO close the current Host block so
// their directives don't leak. Host wildcard patterns are skipped, but a
// `Host a b c` line fans its directives out to every concrete alias, and
// duplicate Host blocks for the same alias merge (first scalar value wins,
// forwards accumulate) per OpenSSH semantics. Quoted values are unquoted and
// trailing `# comments` are stripped (a `#` inside a value is preserved).

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

/// One `Host a b c` block. Directives accumulate here and are fanned out to
/// every concrete alias on flush, so multi-alias blocks aren't lossy.
struct Block {
    aliases: Vec<String>,
    hostname: Option<String>,
    port: Option<u16>,
    user: Option<String>,
    identity_file: Option<String>,
    proxy_jump_alias: Option<String>,
    forwards: Vec<ParsedForward>,
}

pub fn parse(content: &str) -> Vec<ParsedHost> {
    let mut hosts: Vec<ParsedHost> = Vec::new();
    let mut current: Option<Block> = None;

    for raw in content.lines() {
        let line = strip_comment(raw).trim();
        if line.is_empty() { continue; }

        let (key, value) = match split_key_value(line) {
            Some(kv) => kv,
            None => continue,
        };

        let key_lower = key.to_ascii_lowercase();
        if key_lower == "host" {
            if let Some(b) = current.take() {
                flush_block(&mut hosts, b);
            }
            // a Host line may list multiple aliases — keep them all; wildcards
            // are filtered out at flush time but still consume their directives.
            current = Some(Block {
                aliases: value.split_whitespace().map(|s| s.to_string()).collect(),
                hostname: None,
                port: None,
                user: None,
                identity_file: None,
                proxy_jump_alias: None,
                forwards: Vec::new(),
            });
            continue;
        }
        if key_lower == "match" {
            // Match blocks are unsupported. Close the current Host block so
            // directives under Match don't leak onto the previous Host.
            if let Some(b) = current.take() {
                flush_block(&mut hosts, b);
            }
            continue;
        }

        // Directives before the first `Host` (or inside a closed Match) have
        // no block to attach to and are ignored.
        let Some(h) = current.as_mut() else { continue };

        match key_lower.as_str() {
            "hostname" => h.hostname = Some(unquote(value)),
            "port" => h.port = value.parse().ok(),
            "user" => h.user = Some(unquote(value)),
            "identityfile" => {
                // a Host may list multiple IdentityFile lines; first one wins
                if h.identity_file.is_none() {
                    h.identity_file = Some(unquote(value));
                }
            }
            "proxyjump" => {
                // value form: "[user@]host[:port][,user@host[:port]...]"
                // take only the first hop's host part for matching
                let first_hop = value.split(',').next().unwrap_or("").trim();
                let after_user = first_hop.rsplit('@').next().unwrap_or("");
                let host_only = unquote(after_user.split(':').next().unwrap_or(""));
                if !host_only.is_empty() {
                    h.proxy_jump_alias = Some(host_only);
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

    if let Some(b) = current.take() {
        flush_block(&mut hosts, b);
    }

    hosts
}

fn is_wildcard(s: &str) -> bool {
    s.contains('*') || s.contains('?') || s.contains('!')
}

/// Fan a parsed block out to one ParsedHost per concrete (non-wildcard)
/// alias. If an alias already exists (duplicate `Host` blocks), merge using
/// OpenSSH semantics: the first obtained scalar value wins, forwards accumulate.
fn flush_block(out: &mut Vec<ParsedHost>, block: Block) {
    for alias in block.aliases.iter().filter(|a| !is_wildcard(a)) {
        if let Some(existing) = out.iter_mut().find(|h| &h.alias == alias) {
            if existing.hostname.is_none() { existing.hostname = block.hostname.clone(); }
            if existing.port.is_none() { existing.port = block.port; }
            if existing.user.is_none() { existing.user = block.user.clone(); }
            if existing.identity_file.is_none() { existing.identity_file = block.identity_file.clone(); }
            if existing.proxy_jump_alias.is_none() { existing.proxy_jump_alias = block.proxy_jump_alias.clone(); }
            existing.forwards.extend(block.forwards.iter().cloned());
        } else {
            out.push(ParsedHost {
                alias: alias.clone(),
                hostname: block.hostname.clone(),
                port: block.port,
                user: block.user.clone(),
                identity_file: block.identity_file.clone(),
                proxy_jump_alias: block.proxy_jump_alias.clone(),
                forwards: block.forwards.clone(),
            });
        }
    }
}

/// Strip one layer of surrounding matched quotes (OpenSSH allows quoting
/// values that contain spaces). Inner content is taken verbatim.
fn unquote(s: &str) -> String {
    let b = s.as_bytes();
    if b.len() >= 2 {
        let (first, last) = (b[0], b[b.len() - 1]);
        if (first == b'"' && last == b'"') || (first == b'\'' && last == b'\'') {
            return s[1..s.len() - 1].to_string();
        }
    }
    s.to_string()
}

/// Strip a trailing `# comment`. A `#` only starts a comment when it is at the
/// start of the line or preceded by whitespace AND not inside quotes — a `#`
/// embedded in a value (e.g. a path or token) is kept.
fn strip_comment(line: &str) -> &str {
    let bytes = line.as_bytes();
    let mut in_quote: Option<u8> = None;
    let mut prev_ws = true; // start-of-line counts as "preceded by whitespace"
    let mut i = 0;
    while i < bytes.len() {
        let b = bytes[i];
        match in_quote {
            Some(q) => { if b == q { in_quote = None; } }
            None => {
                if b == b'"' || b == b'\'' {
                    in_quote = Some(b);
                } else if b == b'#' && prev_ws {
                    return &line[..i];
                }
            }
        }
        prev_ws = b == b' ' || b == b'\t';
        i += 1;
    }
    line
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
    fn multi_alias_host_emits_all_concrete_aliases() {
        // A `Host a b c` line applies its directives to every listed alias;
        // wildcards are skipped but the concrete aliases must all appear.
        let cfg = "Host real * other\n  HostName r.example\n  User ops\n";
        let parsed = parse(cfg);
        assert_eq!(parsed.len(), 2);
        let real = parsed.iter().find(|h| h.alias == "real").expect("real present");
        let other = parsed.iter().find(|h| h.alias == "other").expect("other present");
        assert_eq!(real.hostname.as_deref(), Some("r.example"));
        assert_eq!(real.user.as_deref(), Some("ops"));
        assert_eq!(other.hostname.as_deref(), Some("r.example"));
        assert_eq!(other.user.as_deref(), Some("ops"));
    }

    #[test]
    fn strips_surrounding_quotes_from_values() {
        let cfg = "Host q\n  HostName \"my host.example\"\n  User \"svc user\"\n  IdentityFile \"~/My Keys/id_ed25519\"\n";
        let h = &parse(cfg)[0];
        assert_eq!(h.hostname.as_deref(), Some("my host.example"));
        assert_eq!(h.user.as_deref(), Some("svc user"));
        assert_eq!(h.identity_file.as_deref(), Some("~/My Keys/id_ed25519"));
    }

    #[test]
    fn hash_not_preceded_by_whitespace_is_kept_in_value() {
        // A '#' embedded in a value (no leading space) is part of the value,
        // not the start of a comment. Only ' # ...' is a trailing comment.
        let cfg = "Host h\n  IdentityFile ~/.ssh/id#backup\n  HostName a.example #real comment\n";
        let h = &parse(cfg)[0];
        assert_eq!(h.identity_file.as_deref(), Some("~/.ssh/id#backup"));
        assert_eq!(h.hostname.as_deref(), Some("a.example"));
    }

    #[test]
    fn merges_duplicate_host_blocks_first_value_wins() {
        // OpenSSH applies the first obtained value per keyword and accumulates
        // forwards across blocks for the same alias.
        let cfg = "Host db\n  HostName db.example\n  LocalForward 5432 localhost:5432\nHost db\n  HostName other.example\n  User postgres\n  LocalForward 6432 localhost:6432\n";
        let parsed = parse(cfg);
        assert_eq!(parsed.len(), 1);
        let h = &parsed[0];
        assert_eq!(h.hostname.as_deref(), Some("db.example")); // first wins
        assert_eq!(h.user.as_deref(), Some("postgres"));       // only set in 2nd block
        assert_eq!(h.forwards.len(), 2);                       // accumulated
    }

    #[test]
    fn match_block_does_not_leak_into_previous_host() {
        // Directives inside an (unsupported) Match block must not be attributed
        // to the preceding Host block.
        let cfg = "Host h\n  HostName h.example\nMatch user bob\n  User leaked\n";
        let parsed = parse(cfg);
        assert_eq!(parsed.len(), 1);
        assert_eq!(parsed[0].alias, "h");
        assert_eq!(parsed[0].user, None);
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

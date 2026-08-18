// EventLog — a small ring buffer of "what happened" (tunnel connected /
// dropped / reconnecting / failed / stopped, host test ok / fail) that the
// dashboard shows as a timeline. Kept in memory and mirrored to a JSON file
// so the list survives a restart; events are rare (a handful per hour), so
// rewriting the file on each record is cheap.

use std::collections::VecDeque;
use std::path::PathBuf;
use std::sync::Mutex;

use serde::{Deserialize, Serialize};
use uuid::Uuid;

pub const MAX_EVENTS: usize = 200;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum EventKind {
    Tunnel,
    Host,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppEvent {
    pub id: u64,
    /// unix ms
    pub at: i64,
    pub kind: EventKind,
    pub subject_id: Uuid,
    /// tunnel name / host alias at the time of the event
    pub subject: String,
    /// tunnel: connected | reconnecting | failed | stopped
    /// host:   ok | fail
    pub status: String,
    #[serde(default)]
    pub detail: Option<String>,
    /// reconnect attempt number for `reconnecting`
    #[serde(default)]
    pub attempt: Option<u32>,
}

pub struct EventLog {
    path: Option<PathBuf>,
    inner: Mutex<Inner>,
}

struct Inner {
    next_id: u64,
    events: VecDeque<AppEvent>,
}

impl EventLog {
    /// `path` = where to mirror the log (JSON array); None = memory only.
    pub fn load(path: Option<PathBuf>) -> Self {
        let mut events: VecDeque<AppEvent> = VecDeque::new();
        if let Some(p) = &path {
            if let Ok(text) = std::fs::read_to_string(p) {
                if let Ok(list) = serde_json::from_str::<Vec<AppEvent>>(&text) {
                    events = list.into_iter().collect();
                    while events.len() > MAX_EVENTS { events.pop_front(); }
                }
            }
        }
        let next_id = events.iter().map(|e| e.id).max().unwrap_or(0) + 1;
        Self { path, inner: Mutex::new(Inner { next_id, events }) }
    }

    pub fn record(
        &self,
        kind: EventKind,
        subject_id: Uuid,
        subject: impl Into<String>,
        status: impl Into<String>,
        detail: Option<String>,
        attempt: Option<u32>,
    ) -> AppEvent {
        let mut g = self.inner.lock().unwrap();
        let ev = AppEvent {
            id: g.next_id,
            at: crate::store::now_ms(),
            kind,
            subject_id,
            subject: subject.into(),
            status: status.into(),
            detail,
            attempt,
        };
        g.next_id += 1;
        g.events.push_back(ev.clone());
        while g.events.len() > MAX_EVENTS { g.events.pop_front(); }
        if let Some(p) = &self.path {
            let snapshot: Vec<&AppEvent> = g.events.iter().collect();
            let _ = write_json(p, &snapshot);
        }
        ev
    }

    /// Newest first.
    pub fn recent(&self, limit: usize) -> Vec<AppEvent> {
        let g = self.inner.lock().unwrap();
        g.events.iter().rev().take(limit).cloned().collect()
    }
}

fn write_json(path: &PathBuf, value: &impl Serialize) -> std::io::Result<()> {
    if let Some(parent) = path.parent() { std::fs::create_dir_all(parent)?; }
    let text = serde_json::to_string(value)?;
    let tmp = path.with_extension("json.tmp");
    std::fs::write(&tmp, text)?;
    std::fs::rename(&tmp, path)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ring_buffer_caps_and_orders_newest_first() {
        let log = EventLog::load(None);
        for i in 0..(MAX_EVENTS + 5) {
            log.record(EventKind::Tunnel, Uuid::nil(), "t", "connected", Some(i.to_string()), None);
        }
        let recent = log.recent(10);
        assert_eq!(recent.len(), 10);
        assert_eq!(recent[0].detail.as_deref(), Some(&*(MAX_EVENTS + 4).to_string()));
        assert_eq!(log.recent(1000).len(), MAX_EVENTS);
    }

    #[test]
    fn persists_and_reloads() {
        let dir = std::env::temp_dir().join(format!("tunelo-events-{}", Uuid::new_v4()));
        let path = dir.join("events.json");
        {
            let log = EventLog::load(Some(path.clone()));
            log.record(EventKind::Host, Uuid::nil(), "jump", "ok", Some("18ms".into()), None);
            log.record(EventKind::Tunnel, Uuid::nil(), "db", "reconnecting", Some("reset".into()), Some(2));
        }
        let log = EventLog::load(Some(path.clone()));
        let recent = log.recent(10);
        assert_eq!(recent.len(), 2);
        assert_eq!(recent[0].subject, "db");
        assert_eq!(recent[0].attempt, Some(2));
        // ids keep increasing across reloads
        let ev = log.record(EventKind::Tunnel, Uuid::nil(), "db", "connected", None, None);
        assert_eq!(ev.id, 3);
        let _ = std::fs::remove_dir_all(dir);
    }
}

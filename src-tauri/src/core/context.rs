use std::sync::Arc;

use crate::config::SettingsStore;
use crate::core::event::Sink;
use crate::core::events::EventLog;
use crate::ssh::Supervisor;
use crate::store::Store;

/// Single, framework-agnostic handle to all backend state. Both the
/// Tauri command layer and the axum web layer hold `Arc<AppContext>`
/// and call methods on `store`, `settings`, and `supervisor` directly.
///
/// The `sink` field decides where events go: GUI mode uses `TauriSink`
/// to push through Tauri's IPC; Web mode uses `BroadcastSink` so SSE
/// connections receive the same events.
pub struct AppContext {
    pub store: Store,
    pub settings: SettingsStore,
    pub supervisor: Supervisor,
    pub sink: Sink,
    /// Recent-activity ring buffer shown on the dashboard.
    pub events: EventLog,
}

impl AppContext {
    pub fn new(store: Store, settings: SettingsStore, events: EventLog, sink: Sink) -> Arc<Self> {
        Arc::new(Self {
            store,
            settings,
            supervisor: Supervisor::new(),
            sink,
            events,
        })
    }

    /// Record an event and push it to connected clients in one go.
    pub fn record_event(
        &self,
        kind: crate::core::events::EventKind,
        subject_id: uuid::Uuid,
        subject: impl Into<String>,
        status: impl Into<String>,
        detail: Option<String>,
        attempt: Option<u32>,
    ) {
        let ev = self.events.record(kind, subject_id, subject, status, detail, attempt);
        let payload = serde_json::to_value(&ev).unwrap_or(serde_json::Value::Null);
        self.sink.emit("event:new", payload);
    }
}

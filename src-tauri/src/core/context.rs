use std::sync::Arc;

use crate::config::SettingsStore;
use crate::core::event::Sink;
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
}

impl AppContext {
    pub fn new(store: Store, settings: SettingsStore, sink: Sink) -> Arc<Self> {
        Arc::new(Self {
            store,
            settings,
            supervisor: Supervisor::new(),
            sink,
        })
    }
}

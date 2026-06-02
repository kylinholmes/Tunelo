use std::sync::Arc;
use serde_json::Value;
use tokio::sync::broadcast;

/// Backend-agnostic event emitter. GUI mode wraps Tauri's `AppHandle`;
/// Web mode wraps a `tokio::sync::broadcast::Sender` that SSE consumers
/// subscribe to. Anything emitting an event (the ssh Runner, host-test
/// handler, settings save) goes through this trait — no direct
/// `app.emit(...)` calls anywhere in business code.
pub trait EventSink: Send + Sync {
    fn emit(&self, topic: &str, payload: Value);
}

/// Tauri-backed sink. Used by the GUI startup path. Absent on Linux,
/// where we only build the web frontend (no Tauri dependency).
#[cfg(not(target_os = "linux"))]
pub struct TauriSink(pub tauri::AppHandle);

#[cfg(not(target_os = "linux"))]
impl EventSink for TauriSink {
    fn emit(&self, topic: &str, payload: Value) {
        use tauri::Emitter;
        if let Err(e) = self.0.emit(topic, payload) {
            eprintln!("[TauriSink] emit({topic}) failed: {e}");
        }
    }
}

pub type Sink = Arc<dyn EventSink>;

/// Multi-producer / multi-subscriber sink for Web mode. Each SSE
/// connection holds a `Receiver`; emits never block — if a receiver
/// lags behind, it gets a Lagged error which the SSE bridge handles.
#[derive(Clone)]
pub struct BroadcastSink {
    tx: broadcast::Sender<(String, Value)>,
}

impl BroadcastSink {
    pub fn new(capacity: usize) -> Self {
        let (tx, _rx) = broadcast::channel(capacity);
        Self { tx }
    }

    pub fn subscribe(&self) -> broadcast::Receiver<(String, Value)> {
        self.tx.subscribe()
    }
}

impl EventSink for BroadcastSink {
    fn emit(&self, topic: &str, payload: Value) {
        // send returns Err only if there are no active receivers — fine.
        let _ = self.tx.send((topic.to_string(), payload));
    }
}

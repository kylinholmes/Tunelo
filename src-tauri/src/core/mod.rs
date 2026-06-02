pub mod context;
pub mod event;
pub mod startup;

pub use context::AppContext;
pub use event::{BroadcastSink, Sink};
#[cfg(not(target_os = "linux"))]
pub use event::TauriSink;

/// Spawn a detached background task off the shared startup / supervisor
/// paths. Desktop builds route through Tauri's managed runtime because
/// the GUI `setup` callback runs outside any tokio context; the Linux
/// web build is always inside its own tokio runtime, so it uses
/// `tokio::spawn` directly and never links Tauri.
#[cfg(not(target_os = "linux"))]
pub fn spawn<F>(future: F)
where
    F: std::future::Future<Output = ()> + Send + 'static,
{
    tauri::async_runtime::spawn(future);
}

#[cfg(target_os = "linux")]
pub fn spawn<F>(future: F)
where
    F: std::future::Future<Output = ()> + Send + 'static,
{
    tokio::spawn(future);
}

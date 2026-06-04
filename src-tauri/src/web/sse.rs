use std::convert::Infallible;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Arc;
use std::time::Duration;

use axum::response::sse::{Event, KeepAlive, Sse};
use futures_util::Stream;
use tokio::sync::broadcast;
use tokio_stream::wrappers::BroadcastStream;
use tokio_stream::StreamExt;

/// Caps the number of concurrent SSE connections so a misbehaving (or hostile)
/// client can't open unbounded streams. Cloned into the router via Extension.
#[derive(Clone)]
pub struct SseLimiter {
    count: Arc<AtomicUsize>,
    max: usize,
}

impl SseLimiter {
    pub fn new(max: usize) -> Self {
        Self { count: Arc::new(AtomicUsize::new(0)), max }
    }

    /// Reserve a connection slot, or `None` when already at capacity. The
    /// returned guard releases the slot when dropped (i.e. when the stream ends).
    pub fn acquire(&self) -> Option<SseGuard> {
        let prev = self.count.fetch_add(1, Ordering::SeqCst);
        if prev >= self.max {
            self.count.fetch_sub(1, Ordering::SeqCst);
            None
        } else {
            Some(SseGuard { count: self.count.clone() })
        }
    }
}

pub struct SseGuard {
    count: Arc<AtomicUsize>,
}

impl Drop for SseGuard {
    fn drop(&mut self) {
        self.count.fetch_sub(1, Ordering::SeqCst);
    }
}

/// Bridge a broadcast Receiver into an SSE response. Lagged errors (slow client
/// falling behind the ring buffer) emit a `lagged` event rather than break the
/// stream — the frontend resyncs by re-fetching `/api/tunnels` etc. The
/// `guard` is held for the lifetime of the stream so the connection slot is
/// released when the client disconnects.
pub fn stream(
    rx: broadcast::Receiver<(String, serde_json::Value)>,
    guard: SseGuard,
) -> Sse<impl Stream<Item = Result<Event, Infallible>>> {
    let stream = BroadcastStream::new(rx).map(move |msg| {
        // hold the slot for as long as the stream lives
        let _ = &guard;
        let event = match msg {
            Ok((topic, payload)) => Event::default()
                .event(topic)
                .data(payload.to_string()),
            Err(_lagged) => Event::default()
                .event("lagged")
                .data("{}"),
        };
        Ok(event)
    });

    Sse::new(stream).keep_alive(
        KeepAlive::new()
            .interval(Duration::from_secs(15))
            .text("ping"),
    )
}

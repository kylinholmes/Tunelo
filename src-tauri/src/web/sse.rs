use std::convert::Infallible;
use std::time::Duration;

use axum::response::sse::{Event, KeepAlive, Sse};
use futures_util::Stream;
use tokio::sync::broadcast;
use tokio_stream::wrappers::BroadcastStream;
use tokio_stream::StreamExt;

/// Bridge a broadcast Receiver into an SSE response. Lagged errors
/// (slow client falling behind the ring buffer) emit a `lagged` event
/// rather than break the stream — the frontend can resync by
/// re-fetching `/api/tunnels` etc.
pub fn stream(
    rx: broadcast::Receiver<(String, serde_json::Value)>,
) -> Sse<impl Stream<Item = Result<Event, Infallible>>> {
    let stream = BroadcastStream::new(rx).map(|msg| {
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

use std::convert::Infallible;

use axum::{
    extract::Extension,
    http::StatusCode,
    response::sse::{Event, Sse},
};
use futures_util::Stream;

use crate::core::BroadcastSink;
use crate::web::sse::{self, SseLimiter};

pub async fn stream(
    Extension(sink): Extension<BroadcastSink>,
    Extension(limiter): Extension<SseLimiter>,
) -> Result<Sse<impl Stream<Item = Result<Event, Infallible>>>, StatusCode> {
    match limiter.acquire() {
        Some(guard) => Ok(sse::stream(sink.subscribe(), guard)),
        None => Err(StatusCode::SERVICE_UNAVAILABLE),
    }
}

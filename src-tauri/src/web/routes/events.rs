use std::convert::Infallible;

use axum::{
    extract::Extension,
    response::sse::{Event, Sse},
};
use futures_util::Stream;

use crate::core::BroadcastSink;
use crate::web::sse;

pub async fn stream(
    Extension(sink): Extension<BroadcastSink>,
) -> Sse<impl Stream<Item = Result<Event, Infallible>>> {
    sse::stream(sink.subscribe())
}

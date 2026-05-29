use axum::{
    extract::{Extension, Query},
    http::{HeaderMap, StatusCode},
    middleware::Next,
    response::Response,
};
use serde::Deserialize;

/// Per-request token via `?token=` query string — used by EventSource
/// which cannot set custom headers. Regular API uses the Authorization
/// header.
#[derive(Deserialize)]
pub struct TokenQuery {
    pub token: Option<String>,
}

/// Set on the Router via `axum::Extension`; the resolved secret either
/// is `None` (auth disabled, loopback-only) or `Some(string)` (Bearer
/// token required).
#[derive(Clone)]
pub struct EffectiveSecret(pub Option<String>);

/// Middleware that requires a matching Bearer token (or `?token=` query
/// param) when an `EffectiveSecret(Some(_))` is configured. When the
/// effective secret is `None`, every request passes through.
///
/// Uses the typed `Extension<EffectiveSecret>` extractor so that if the
/// extension is missing from the router (misconfigured route), axum
/// returns HTTP 500 automatically — fail closed rather than fail open.
pub async fn require_secret(
    Extension(secret): Extension<EffectiveSecret>,
    headers: HeaderMap,
    Query(q): Query<TokenQuery>,
    request: axum::extract::Request,
    next: Next,
) -> Result<Response, StatusCode> {
    match secret.0 {
        None => Ok(next.run(request).await),
        Some(want) => {
            let bearer = headers.get("authorization")
                .and_then(|v| v.to_str().ok())
                .and_then(|s| s.strip_prefix("Bearer "))
                .map(|s| s.to_string());
            let token = bearer.or(q.token);
            if token.as_deref() == Some(&want) {
                Ok(next.run(request).await)
            } else {
                Err(StatusCode::UNAUTHORIZED)
            }
        }
    }
}

use axum::{
    extract::{Extension, Query},
    http::{HeaderMap, StatusCode},
    middleware::Next,
    response::Response,
};
use serde::Deserialize;

/// Per-request token via `?token=` query string — used by EventSource which
/// cannot set custom headers. The regular JSON API uses the Authorization
/// header only (see `require_secret`).
#[derive(Deserialize)]
pub struct TokenQuery {
    pub token: Option<String>,
}

/// Set on the Router via `axum::Extension`; the resolved secret either is
/// `None` (auth disabled, loopback-only) or `Some(string)` (Bearer token
/// required).
#[derive(Clone)]
pub struct EffectiveSecret(pub Option<String>);

/// Constant-time byte comparison, so a token that matches a longer prefix
/// doesn't take measurably longer to reject than one that fails early — closes
/// a timing side channel on the bearer token. Length is allowed to leak.
fn ct_eq(a: &[u8], b: &[u8]) -> bool {
    if a.len() != b.len() {
        return false;
    }
    let mut diff = 0u8;
    for (x, y) in a.iter().zip(b.iter()) {
        diff |= x ^ y;
    }
    diff == 0
}

fn token_matches(want: &str, got: Option<&str>) -> bool {
    match got {
        Some(t) => ct_eq(want.as_bytes(), t.as_bytes()),
        None => false,
    }
}

fn bearer(headers: &HeaderMap) -> Option<String> {
    headers
        .get("authorization")
        .and_then(|v| v.to_str().ok())
        .and_then(|s| s.strip_prefix("Bearer "))
        .map(|s| s.to_string())
}

/// Header-only auth for the JSON API. The `?token=` query form is deliberately
/// NOT accepted here — tokens in URLs leak into proxy logs and browser history.
///
/// Uses the typed `Extension<EffectiveSecret>` extractor so that if the
/// extension is missing from the router (misconfigured route), axum returns
/// HTTP 500 automatically — fail closed rather than fail open.
pub async fn require_secret(
    Extension(secret): Extension<EffectiveSecret>,
    headers: HeaderMap,
    request: axum::extract::Request,
    next: Next,
) -> Result<Response, StatusCode> {
    match secret.0 {
        None => Ok(next.run(request).await),
        Some(want) => {
            if token_matches(&want, bearer(&headers).as_deref()) {
                Ok(next.run(request).await)
            } else {
                Err(StatusCode::UNAUTHORIZED)
            }
        }
    }
}

/// Auth for the SSE stream only. Additionally accepts `?token=` because the
/// browser EventSource API cannot set the Authorization header.
pub async fn require_secret_sse(
    Extension(secret): Extension<EffectiveSecret>,
    headers: HeaderMap,
    Query(q): Query<TokenQuery>,
    request: axum::extract::Request,
    next: Next,
) -> Result<Response, StatusCode> {
    match secret.0 {
        None => Ok(next.run(request).await),
        Some(want) => {
            let got = bearer(&headers).or(q.token);
            if token_matches(&want, got.as_deref()) {
                Ok(next.run(request).await)
            } else {
                Err(StatusCode::UNAUTHORIZED)
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ct_eq_matches_only_identical() {
        assert!(ct_eq(b"secret", b"secret"));
        assert!(!ct_eq(b"secret", b"secreu")); // last byte differs
        assert!(!ct_eq(b"secret", b"secre")); // length differs
        assert!(!ct_eq(b"", b"x"));
        assert!(ct_eq(b"", b""));
    }

    #[test]
    fn token_matches_requires_exact_present_token() {
        assert!(token_matches("abc", Some("abc")));
        assert!(!token_matches("abc", Some("abd")));
        assert!(!token_matches("abc", None));
    }
}

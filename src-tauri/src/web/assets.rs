use axum::{
    body::Body,
    extract::Path,
    http::{header, StatusCode},
    response::{IntoResponse, Response},
};
use rust_embed::RustEmbed;

/// Frontend bundle. `dist/` is produced by `bun run build`; rust-embed
/// seals it into the binary at compile time so headless deployment
/// stays single-file.
#[derive(RustEmbed)]
#[folder = "../dist/"]
struct Asset;

/// Serve `/` and `/index.html`. The injected script makes the bundled React
/// app aware it's running over HTTP (not Tauri) and whether a bearer token is
/// required. It deliberately does NOT embed the secret — this page is served
/// without auth, so embedding the token would hand it to any unauthenticated
/// caller. When auth is required the frontend prompts for the token and stores
/// it locally (validated against `/api/auth/check`).
pub async fn index(auth_required: bool) -> Response {
    let mut html = match Asset::get("index.html") {
        Some(f) => String::from_utf8_lossy(f.data.as_ref()).into_owned(),
        None => return (StatusCode::INTERNAL_SERVER_ERROR, "index.html missing").into_response(),
    };
    let inject = format!(
        "<script>window.__TUNELO_WEB__=true;window.__TUNELO_AUTH_REQUIRED__={};</script>",
        if auth_required { "true" } else { "false" },
    );
    if let Some(idx) = html.find("</head>") {
        html.insert_str(idx, &inject);
    } else {
        html.insert_str(0, &inject);
    }
    Response::builder()
        .header(header::CONTENT_TYPE, "text/html; charset=utf-8")
        .header(header::CACHE_CONTROL, "no-store")
        .body(Body::from(html))
        .unwrap()
}

pub async fn asset(Path(path): Path<String>) -> Response {
    match Asset::get(&path) {
        Some(file) => {
            let mime = mime_guess::from_path(&path).first_or_octet_stream();
            Response::builder()
                .header(header::CONTENT_TYPE, mime.as_ref())
                .header(header::CACHE_CONTROL, "public, max-age=3600")
                .body(Body::from(file.data.into_owned()))
                .unwrap()
        }
        None => StatusCode::NOT_FOUND.into_response(),
    }
}

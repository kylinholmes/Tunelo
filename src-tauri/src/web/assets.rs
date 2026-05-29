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

/// Serve `/` and `/index.html`. The injected script makes the bundled
/// React app aware it's running over HTTP (not Tauri) and gives it the
/// auth token to use for API/SSE requests.
pub async fn index(secret: Option<String>) -> Response {
    let token = secret.unwrap_or_default();
    let mut html = match Asset::get("index.html") {
        Some(f) => String::from_utf8_lossy(f.data.as_ref()).into_owned(),
        None => return (StatusCode::INTERNAL_SERVER_ERROR, "index.html missing").into_response(),
    };
    let inject = format!(
        "<script>window.__TUNELO_WEB__=true;window.__TUNELO_TOKEN__={};</script>",
        serde_json::to_string(&token).unwrap_or_else(|_| "\"\"".into()),
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

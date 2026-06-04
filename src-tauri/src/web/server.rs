use std::net::SocketAddr;
use std::sync::Arc;

use axum::{routing::get, Extension, Router};
use tokio::net::TcpListener;

use crate::core::AppContext;
use crate::web::auth::EffectiveSecret;

/// Assemble the axum router. The `secret` argument is the resolved
/// effective secret (CLI override > settings.web_secret > None).
/// The `/api/*` sub-router is protected by the auth middleware;
/// `/healthz` stays public. `/events` is a protected SSE stream.
/// Static assets from the embedded `dist/` bundle are served via
/// `.fallback()` so `/api` and `/events` always win over asset routes.
pub fn build_router(
    ctx: Arc<AppContext>,
    secret: Option<String>,
    bsink: crate::core::BroadcastSink,
) -> Router {
    use crate::web::assets;
    use crate::web::routes::{events, hosts, import, settings, tunnels};
    use axum::routing::{delete, post};

    let auth_required = secret.is_some();

    let api = Router::new()
        // hosts
        .route("/hosts", get(hosts::list).post(hosts::save))
        .route("/hosts/:id", delete(hosts::delete))
        .route("/hosts/:id/test", post(import::test_host))
        // tunnels
        .route("/tunnels", get(tunnels::list).post(tunnels::save))
        .route("/tunnels/:id", delete(tunnels::delete))
        .route("/tunnels/:id/start", post(tunnels::start))
        .route("/tunnels/:id/stop", post(tunnels::stop))
        .route("/tunnels/:id/restart", post(tunnels::restart))
        // settings
        .route("/settings", get(settings::get).post(settings::save))
        // auth probe — succeeds (200) only if the bearer token is valid, so the
        // login UI can verify a pasted token; 401 from the middleware otherwise.
        .route("/auth/check", get(|| async { axum::Json(serde_json::json!({ "ok": true })) }))
        // ssh-config
        .route("/ssh-config/hosts", get(import::parse_hosts))
        .route("/ssh-config/tunnels", get(import::parse_tunnels))
        .route("/ssh-config/import-hosts", post(import::import_hosts))
        .route("/ssh-config/import-tunnels", post(import::import_tunnels))
        .layer(axum::middleware::from_fn(crate::web::auth::require_secret))
        .with_state(ctx.clone());

    let events_router = Router::new()
        .route("/events", get(events::stream))
        // SSE accepts ?token= (EventSource can't set headers) — distinct from
        // the header-only API auth.
        .layer(axum::middleware::from_fn(crate::web::auth::require_secret_sse))
        .layer(Extension(crate::web::sse::SseLimiter::new(64)));

    // Order matters: /api and /events are specific prefixes mounted via
    // nest/merge. The static-asset fallback catches everything else and
    // ALSO serves "/" as index. Using .fallback() (instead of a wildcard
    // /*path route) guarantees /api and /events always win over assets.
    Router::new()
        .route("/healthz", get(|| async { "ok" }))
        .nest("/api", api)
        .merge(events_router)
        .fallback({
            move |uri: axum::http::Uri| async move {
                let path = uri.path().trim_start_matches('/');
                if path.is_empty() || path == "index.html" {
                    assets::index(auth_required).await
                } else {
                    assets::asset(axum::extract::Path(path.to_string())).await
                }
            }
        })
        .layer(Extension(bsink))
        .layer(Extension(EffectiveSecret(secret)))
        .with_state(ctx)
}

pub async fn serve(
    addr: SocketAddr,
    router: Router,
    ctx: Arc<AppContext>,
) -> std::io::Result<()> {
    let listener = TcpListener::bind(addr).await?;
    eprintln!("tunelo: listening on http://{}", addr);
    axum::serve(listener, router)
        .with_graceful_shutdown(shutdown_signal(ctx))
        .await
}

async fn shutdown_signal(ctx: Arc<AppContext>) {
    use tokio::signal;

    let ctrl_c = async {
        let _ = signal::ctrl_c().await;
    };

    #[cfg(unix)]
    let terminate = async {
        match signal::unix::signal(signal::unix::SignalKind::terminate()) {
            Ok(mut s) => {
                s.recv().await;
            }
            Err(_) => std::future::pending::<()>().await,
        }
    };

    #[cfg(not(unix))]
    let terminate = std::future::pending::<()>();

    tokio::select! {
        _ = ctrl_c => {},
        _ = terminate => {},
    }
    eprintln!("tunelo: shutting down — killing ssh children");
    ctx.supervisor.kill_all_blocking();
}

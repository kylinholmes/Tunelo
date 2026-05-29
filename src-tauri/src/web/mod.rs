pub mod assets;
pub mod auth;
pub mod cli;
pub mod routes;
pub mod server;
pub mod sse;

use std::net::SocketAddr;
use std::sync::Arc;

use crate::config::SettingsStore;
use crate::core::{startup, AppContext, BroadcastSink, Sink};
use crate::store::Store;
use crate::web::cli::Cli;

pub fn run_web(cli: Cli) {
    // 1. Resolve data dirs (OS-data; portable mode is GUI-focused and
    //    intentionally skipped here).
    let (config_dir, data_dir) = match resolve_dirs() {
        Some(p) => p,
        None => {
            eprintln!("error: 无法解析数据目录");
            std::process::exit(1);
        }
    };

    // 2. Load store + settings (same as lib.rs::setup).
    let store = match Store::load(data_dir.join("state.toml")) {
        Ok(s) => s,
        Err(e) => { eprintln!("error: 加载 state.toml 失败: {:?}", e); std::process::exit(1); }
    };
    let settings = match SettingsStore::load(config_dir.join("settings.toml")) {
        Ok(s) => s,
        Err(e) => { eprintln!("error: 加载 settings.toml 失败: {:?}", e); std::process::exit(1); }
    };

    // 3. Resolve effective secret: CLI override > settings.web_secret > None.
    let stored = settings.get().web_secret.clone();
    let secret = cli.secret.or(stored).filter(|s| !s.is_empty());

    // 4. Loopback-vs-public enforcement.
    if !cli.bind.is_loopback() && secret.is_none() {
        eprintln!("error: 非 loopback 地址必须设置 --secret 或 settings.web_secret");
        std::process::exit(1);
    }

    // 5. Build ctx with BroadcastSink so SSE consumers receive live events.
    let bsink = BroadcastSink::new(64);
    let sink: Sink = Arc::new(bsink.clone());
    let ctx = AppContext::new(store, settings, sink);

    // 6. Apply shared startup actions (auto-detect ssh, auto-connect, etc.)
    //    startup::apply_startup_actions uses tokio::spawn internally, so it
    //    must be called from within the tokio runtime (step 7).

    // 7. Build router + serve.
    let addr = SocketAddr::new(cli.bind, cli.port);
    let router = server::build_router(ctx.clone(), secret, bsink);

    // axum needs a tokio runtime. Spin one up explicitly so we don't
    // depend on tauri::async_runtime here.
    let rt = match tokio::runtime::Runtime::new() {
        Ok(rt) => rt,
        Err(e) => { eprintln!("error: tokio runtime 启动失败: {}", e); std::process::exit(1); }
    };
    rt.block_on(async move {
        startup::apply_startup_actions(ctx.clone());
        if let Err(e) = server::serve(addr, router, ctx).await {
            eprintln!("error: server 退出: {}", e);
            std::process::exit(1);
        }
    });
}

fn resolve_dirs() -> Option<(std::path::PathBuf, std::path::PathBuf)> {
    let cfg = dirs::config_dir()?.join("io.github.kylinholmes.tunelo");
    let data = dirs::data_dir()?.join("io.github.kylinholmes.tunelo");
    Some((cfg, data))
}

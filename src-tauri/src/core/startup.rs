// Initialization steps shared by all frontends (GUI, Web, future TUI):
// 1. Clear stale runtime state ("connected" left over from last session)
// 2. Re-detect ssh paths so portable / fresh installs work
// 3. Auto-start tunnels flagged with auto_start=true (respecting
//    settings.auto_connect_on_boot)
//
// Spawned actions use the supervisor inside ctx; the function returns
// after kicking them off, so caller is free to start its event loop.

use std::sync::Arc;
use std::time::Duration;

use crate::core::AppContext;

pub fn apply_startup_actions(ctx: Arc<AppContext>) {
    ctx.store.reset_runtime_states();

    if let Err(e) = ctx.settings.auto_detect_paths() {
        eprintln!("ssh path auto-detect 失败: {:?}", e);
    }

    let should_auto_connect = ctx.settings.get().auto_connect_on_boot;
    let auto_start_ids = ctx.store.tunnels_with_auto_start();
    if !should_auto_connect || auto_start_ids.is_empty() {
        return;
    }

    crate::core::spawn(async move {
        // small delay so listeners (window mount / SSE connect) have a
        // chance to subscribe before we start emitting status events
        tokio::time::sleep(Duration::from_millis(500)).await;
        for id in auto_start_ids {
            if let Err(e) = ctx.supervisor.start(id, ctx.clone()) {
                eprintln!("auto-start 隧道 {} 失败: {:?}", id, e);
            }
        }
    });
}

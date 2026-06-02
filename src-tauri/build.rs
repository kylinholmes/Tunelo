fn main() {
    // Build scripts run on the *host*, but the artifact is chosen by the
    // *target*. On Linux we build the headless web server, which has no
    // desktop bundle to generate — so skip the Tauri codegen there.
    // CARGO_CFG_TARGET_OS reflects the target triple even when
    // cross-compiling, unlike `cfg!(target_os = ...)` which is the host.
    let target_os = std::env::var("CARGO_CFG_TARGET_OS").unwrap_or_default();
    if target_os != "linux" {
        tauri_build::build();
    }
}

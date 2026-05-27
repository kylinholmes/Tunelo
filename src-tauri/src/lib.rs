use tauri::{
    Manager, AppHandle, WindowEvent,
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
};

mod commands;
mod config;
mod error;
mod ssh;
mod ssh_config;
mod store;

use crate::config::SettingsStore;
use crate::ssh::Supervisor;
use crate::store::Store;

pub struct AppState {
    pub store: Store,
    pub settings: SettingsStore,
}

/// Bring the main window to the foreground (show + unminimize + focus).
fn show_main_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

/// Returns the directory next to the running exe — but only when this
/// looks like a portable install (writable + not installed into a
/// system path). In dev builds we never go portable, so debugging
/// always uses the standard OS data dir.
fn portable_root() -> Option<std::path::PathBuf> {
    if cfg!(debug_assertions) { return None; }

    let exe = std::env::current_exe().ok()?;
    let parent = exe.parent()?.to_path_buf();
    let parent_lc = parent.to_string_lossy().to_lowercase();

    // Reject typical "installed" locations
    #[cfg(target_os = "windows")]
    {
        for bad in ["\\program files\\", "\\program files (x86)\\",
                    "\\windows\\system32\\", "\\windows\\syswow64\\"] {
            if parent_lc.contains(bad) { return None; }
        }
    }
    #[cfg(target_os = "macos")]
    {
        if parent_lc.starts_with("/applications") { return None; }
    }
    #[cfg(target_os = "linux")]
    {
        if parent_lc.starts_with("/usr/") || parent_lc.starts_with("/opt/") {
            return None;
        }
    }

    // Probe: can we actually write next to the exe?
    let probe = parent.join(".tunelo-write-probe");
    if std::fs::write(&probe, b"").is_err() {
        return None;
    }
    let _ = std::fs::remove_file(&probe);

    Some(parent.join("Tunelo-data"))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ))
        .setup(|app| {
            // Portable mode: when the exe lives somewhere writable and
            // not in a system "installed" path, we keep our state next
            // to the binary (a `Tunelo-data/` sibling folder). Otherwise
            // we use the OS user data dir.
            let (config_dir, data_dir) = match portable_root() {
                Some(p) => {
                    let _ = std::fs::create_dir_all(&p);
                    eprintln!("Tunelo: portable mode, data at {}", p.display());
                    (p.clone(), p)
                }
                None => {
                    let cd = app.path().app_config_dir()
                        .expect("无法解析 app_config_dir");
                    let dd = app.path().app_data_dir()
                        .expect("无法解析 app_data_dir");
                    (cd, dd)
                }
            };
            let store = Store::load(data_dir.join("state.toml"))
                .expect("加载 state.toml 失败");
            let settings = SettingsStore::load(config_dir.join("settings.toml"))
                .expect("加载 settings.toml 失败");

            // Crashed/last-session leftovers: clear runtime fields so we
            // don't show "connected" for tunnels that aren't actually up.
            store.reset_runtime_states();

            // Re-detect ssh paths every boot.
            if let Err(e) = settings.auto_detect_paths() {
                eprintln!("ssh path auto-detect 失败: {:?}", e);
            }

            // Capture whether we should auto-connect before moving state
            // into managed storage.
            let should_auto_connect = settings.get().auto_connect_on_boot;
            let auto_start_ids = store.tunnels_with_auto_start();

            app.manage(AppState { store, settings });
            app.manage(Supervisor::new());

            // ─── system tray ───
            let show_item = MenuItem::with_id(app, "tray_show", "显示主窗口", true, None::<&str>)?;
            let quit_item = MenuItem::with_id(app, "tray_quit", "退出 Tunelo", true, None::<&str>)?;
            let tray_menu = Menu::with_items(app, &[&show_item, &quit_item])?;

            let _tray = TrayIconBuilder::with_id("tunelo-tray")
                .icon(app.default_window_icon().expect("no app icon").clone())
                .tooltip("Tunelo")
                .menu(&tray_menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "tray_show" => show_main_window(app),
                    "tray_quit" => {
                        // Reap ssh children before asking Tauri to exit
                        // so we don't depend on RunEvent timing.
                        if let Some(sup) = app.try_state::<Supervisor>() {
                            sup.kill_all_blocking();
                        }
                        app.exit(0);
                    }
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event {
                        show_main_window(tray.app_handle());
                    }
                })
                .build(app)?;

            if should_auto_connect && !auto_start_ids.is_empty() {
                let app_handle = app.handle().clone();
                tauri::async_runtime::spawn(async move {
                    // small delay to let the window finish creating before
                    // we start emitting status events
                    tokio::time::sleep(std::time::Duration::from_millis(500)).await;
                    let supervisor = app_handle.state::<Supervisor>();
                    for id in auto_start_ids {
                        if let Err(e) = supervisor.start(id, app_handle.clone()) {
                            eprintln!("auto-start 隧道 {} 失败: {:?}", id, e);
                        }
                    }
                });
            }

            Ok(())
        })
        .on_window_event(|window, event| {
            // Intercept the close button on the main window: if the user
            // has "minimize to tray on close" enabled we hide instead of
            // letting the window (and the app) exit. Quit is reachable
            // from the tray menu.
            if let WindowEvent::CloseRequested { api, .. } = event {
                if window.label() != "main" { return; }
                let app = window.app_handle();
                let should_minimize = app.try_state::<AppState>()
                    .map(|s| s.settings.get().minimize_to_tray_on_close)
                    .unwrap_or(true);  // safe default if state not ready yet
                if should_minimize {
                    api.prevent_close();
                    let _ = window.hide();
                } else {
                    // Window will close and the app is about to exit.
                    // Pre-emptively reap ssh children here rather than
                    // depending on RunEvent::ExitRequested timing — on
                    // Windows the event can arrive after the process
                    // has already begun tearing down.
                    if let Some(sup) = app.try_state::<Supervisor>() {
                        sup.kill_all_blocking();
                    }
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            commands::host_cmd::list_hosts,
            commands::host_cmd::save_host,
            commands::host_cmd::delete_host,
            commands::host_cmd::test_host,
            commands::tunnel_cmd::list_tunnels,
            commands::tunnel_cmd::save_tunnel,
            commands::tunnel_cmd::delete_tunnel,
            commands::settings_cmd::get_settings,
            commands::settings_cmd::save_settings,
            commands::import_cmd::parse_ssh_config_hosts,
            commands::import_cmd::parse_ssh_config_tunnels,
            commands::import_cmd::import_hosts,
            commands::import_cmd::import_tunnels,
            commands::ssh_cmd::start_tunnel,
            commands::ssh_cmd::stop_tunnel,
            commands::ssh_cmd::restart_tunnel,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app_handle, event| {
            // App is about to exit — synchronously kill every ssh child
            // so we don't leak orphan tunnel processes.
            if let tauri::RunEvent::ExitRequested { .. } = event {
                let supervisor = app_handle.state::<Supervisor>();
                supervisor.kill_all_blocking();
            }
        });
}

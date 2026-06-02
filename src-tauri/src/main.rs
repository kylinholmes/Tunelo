// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use clap::Parser;
use tunelo_lib::web::cli::Cli;

fn main() {
    let cli = Cli::parse();

    // Linux: there's no GUI shell in this build, so the web server is the
    // only mode — `--web` is implied and not required.
    #[cfg(target_os = "linux")]
    tunelo_lib::web::run_web(cli);

    // Desktop platforms: window by default, `--web` opts into headless.
    #[cfg(not(target_os = "linux"))]
    if cli.web {
        tunelo_lib::web::run_web(cli);
    } else {
        tunelo_lib::run();
    }
}

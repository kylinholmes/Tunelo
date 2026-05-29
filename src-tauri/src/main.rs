// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use clap::Parser;
use tunelo_lib::web::cli::Cli;

fn main() {
    let cli = Cli::parse();
    if cli.web {
        tunelo_lib::web::run_web(cli);
    } else {
        tunelo_lib::run();
    }
}

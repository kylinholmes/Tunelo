use std::net::IpAddr;

use clap::Parser;

#[derive(Parser, Debug)]
#[command(
    name = "tunelo",
    version,
    about = "Tunelo · SSH 隧道管理器",
    long_about = "Run with no arguments for the desktop GUI. Pass --web to expose an HTTP API + browser UI instead."
)]
pub struct Cli {
    /// Run headless: serve the bundled web UI over HTTP instead of opening a window.
    #[arg(long)]
    pub web: bool,

    /// Bind address for the HTTP server (only used with --web).
    #[arg(long, default_value = "127.0.0.1")]
    pub bind: IpAddr,

    /// Port for the HTTP server (only used with --web).
    #[arg(long, default_value_t = 17171)]
    pub port: u16,

    /// Bearer token for authentication (overrides settings.web_secret). Only with --web.
    #[arg(long, requires = "web")]
    pub secret: Option<String>,
}

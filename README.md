<div align="center">

# Tunelo

**简单好用的 SSH 隧道管理器**

[![Release](https://img.shields.io/github/v/release/kylinholmes/Tunelo?color=blue)](https://github.com/kylinholmes/Tunelo/releases)
[![Build](https://img.shields.io/github/actions/workflow/status/kylinholmes/Tunelo/release.yml?label=build)](https://github.com/kylinholmes/Tunelo/actions/workflows/release.yml)
[![Downloads](https://img.shields.io/github/downloads/kylinholmes/Tunelo/total?color=success)](https://github.com/kylinholmes/Tunelo/releases)
[![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-lightgrey)](https://github.com/kylinholmes/Tunelo/releases)
[![Tauri](https://img.shields.io/badge/Tauri-2-24C8DB?logo=tauri&logoColor=white)](https://tauri.app)
[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=white)](https://react.dev)
[![Rust](https://img.shields.io/badge/Rust-backend-orange?logo=rust)](https://www.rust-lang.org)

用图形界面管理 SSH 端口转发，不用再记 `ssh -L 8080:localhost:80 user@host` 这种命令。
断线自动重连，开机自动连接，关掉窗口也在托盘里安静干活。

<!-- 📷 主界面截图占位 -->
![主界面](docs/screenshot-main.png)

</div>

---

## 功能

- **三种隧道类型**：本地转发（`-L`）、远程转发（`-R`）、动态 SOCKS 代理（`-D`）
- **断线自动重连**：网络抖动、服务器重启都不怕，指数退避重试（1s → 2s → 4s … 最长 60s）
- **主机管理**：保存服务器地址、用户名、密钥，支持 ProxyJump 跳板机，一键测试连通性并显示延迟
- **一键导入 `~/.ssh/config`**：已有的 SSH 配置（包括里面的转发规则）直接批量导入
- **开机自启 + 自动连接**：常用隧道设为自动启动，开机即连，无感使用
- **系统托盘**：关闭窗口默认最小化到托盘，不打扰
- **Web 模式**：不开窗口，作为后台服务运行，浏览器远程管理（Linux 服务器友好）
- **便携模式**：解压即用，数据跟着程序走，不写注册表不留垃圾

## Quick Start

1. 从 [Releases](https://github.com/kylinholmes/Tunelo/releases) 下载对应平台的安装包并安装
2. 打开 Tunelo，在 **Hosts** 页添加一台服务器（或点导入，直接读取你的 `~/.ssh/config`）
3. 在 **Tunnels** 页新建一条隧道，选好类型和端口
4. 点启动，状态变绿就通了

> **前提**：电脑上要有 `ssh` 命令。Windows 10/11 和 macOS 都自带，一般无需安装。Tunelo 启动时会自动找到它。

### 三种隧道类型，选哪个？

隧道就是一条经过服务器的加密通道，三种类型只是方向和用法不同：

| 类型 | 干什么 | 什么时候用 |
|---|---|---|
| **本地转发 L** | 把**服务器上的服务**搬到你电脑上访问 | 想连服务器上只对内开放的数据库、内网管理后台等。启动后连本地端口就等于连服务器上的那个服务 |
| **远程转发 R** | 把**你电脑上的服务**暴露给服务器 | 本地开发的网页想给远端的人看、临时把内网服务对外演示。方向和 L 正好相反 |
| **动态代理 D** | 在本地开一个 **SOCKS5 代理**，流量全部从服务器出去 | 想让浏览器等软件"借"服务器的网络上网，访问只有服务器能访问的资源，相当于简易 VPN |

一句话记：**要用服务器上的东西选 L，要给服务器那边看你的东西选 R，要借服务器上网选 D。** 大多数人日常用的都是 L。

每种类型每个字段具体怎么填，见下面的新手教程。

📖 **第一次接触 SSH 隧道？** 看 [新手教程：从零到第一条隧道](docs/guide.md) —— 通俗解释隧道是什么、三种类型怎么选、每个字段填什么，以及常见问题。

## Web 模式（进阶）

不想开窗口，或者要在 Linux 服务器上跑？用 Web 模式，浏览器管理：

```sh
tunelo --web --bind 127.0.0.1 --port 17171 --secret 你的访问口令
```

打开 `http://127.0.0.1:17171` 即可，界面和桌面版完全一样（REST API + SSE 实时推送）。

- `--secret` 是访问口令（Bearer token），也可以在设置里保存 `web_secret`
- 不设口令时只允许绑定在 `127.0.0.1` 上，防止裸奔到公网
- **Linux 版只有 Web 模式**（无 GUI 依赖，可编译成 musl 静态单文件，任何发行版直接跑）

## 开发

```
src/                      React 前端（桌面 WebView 与浏览器共用一套）
  lib/ipc.js              统一 IPC 层：Tauri 环境走 invoke()，浏览器走 fetch /api
src-tauri/src/
  commands/               Tauri IPC 命令层（薄封装）
  web/                    axum HTTP 服务：routes/ + SSE + 鉴权 + 内嵌静态资源
  ssh/                    核心逻辑：supervisor（进程编排）、runner（重连状态机）、import
  store/                  Host / Tunnel 数据模型（state.toml）
  core/startup.rs         启动逻辑：清理残留状态、自动连接
```

两个命令层都委托到同一套核心逻辑，桌面与 Web 行为一致；状态变化桌面端走 Tauri event，Web 端走 SSE。数据存在系统数据目录的 `state.toml` / `settings.toml`（便携模式下在程序目录）。

```sh
bun install
bun tauri dev              # 桌面端开发
bun tauri build            # 打包
bun dev                    # 仅前端（Vite）
cargo run -- --web         # Web 模式（在 src-tauri/ 下）
```

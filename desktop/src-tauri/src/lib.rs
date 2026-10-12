//! Carrot Note for desktop. The whole app is the shared TypeScript UI (desktop/dist); Rust only
//! hosts it and adds what a web page can't do: HTTP without browser limits, files, dialogs,
//! notifications, opening links, and a TCP check for the rentals uptime monitor.

use std::net::{TcpStream, ToSocketAddrs};
use std::time::{Duration, Instant};

/// Connects to `host:port` (e.g. a client's VPS on port 22) and returns how long it took in ms.
#[tauri::command]
async fn tcp_probe(host: String, port: u16) -> Result<u64, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let addr = (host.as_str(), port)
            .to_socket_addrs()
            .map_err(|e| e.to_string())?
            .next()
            .ok_or_else(|| "Address not found".to_string())?;
        let start = Instant::now();
        TcpStream::connect_timeout(&addr, Duration::from_secs(10)).map_err(|e| e.to_string())?;
        Ok(start.elapsed().as_millis() as u64)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_notification::init())
        .invoke_handler(tauri::generate_handler![tcp_probe])
        .run(tauri::generate_context!())
        .expect("error while running Carrot Note");
}

mod bridge;
mod local_terminal;
mod menu;
mod port_forward;

use tauri::{webview::NewWindowResponse, App, Manager, Url, WebviewWindowBuilder};

pub use bridge::{desktop_capabilities, desktop_system_theme, format_window_title, SafeFileRegistry};
pub use local_terminal::LocalTerminalRegistry;
pub use port_forward::PortForwardSessionRegistry;

use bridge::{
    desktop_open_external_url, desktop_open_saved_file, desktop_reveal_saved_file,
    desktop_save_file, desktop_set_active_cluster_title,
};
use local_terminal::{
    desktop_local_terminal_ack_output, desktop_local_terminal_close, desktop_local_terminal_input,
    desktop_local_terminal_resize, desktop_local_terminal_start,
};
use port_forward::{desktop_port_forward_sessions, desktop_port_forward_stop};
use port_forward::{desktop_port_forward_recreate, desktop_port_forward_start};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        // Browser links are intentionally not intercepted by the plugin. Every
        // external navigation goes through the typed, HTTP(S)-validated bridge.
        .plugin(tauri_plugin_opener::Builder::new().open_js_links_on_click(false).build())
        .manage(SafeFileRegistry::default())
        .manage(LocalTerminalRegistry::default())
        .manage(PortForwardSessionRegistry::default())
        .setup(|app| {
            install_main_webview(app)?;
            menu::install_native_menu(app)?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            desktop_capabilities,
            desktop_set_active_cluster_title,
            desktop_open_external_url,
            desktop_save_file,
            desktop_open_saved_file,
            desktop_reveal_saved_file,
            desktop_system_theme,
            desktop_local_terminal_start,
            desktop_local_terminal_input,
            desktop_local_terminal_resize,
            desktop_local_terminal_close,
            desktop_local_terminal_ack_output,
            desktop_port_forward_start,
            desktop_port_forward_sessions,
            desktop_port_forward_stop,
            desktop_port_forward_recreate,
        ])
        .build(tauri::generate_context!())
        .expect("Opsia desktop shell failed to build");
    app.run(|app_handle, event| {
        if let tauri::RunEvent::WindowEvent {
            label,
            event: tauri::WindowEvent::Destroyed,
            ..
        } = &event
        {
            app_handle
                .state::<PortForwardSessionRegistry>()
                .close_owner(label);
        }
        if matches!(event, tauri::RunEvent::ExitRequested { .. } | tauri::RunEvent::Exit) {
            app_handle.state::<LocalTerminalRegistry>().close_all();
            app_handle.state::<PortForwardSessionRegistry>().close_all();
        }
    });
}

fn install_main_webview(app: &App) -> tauri::Result<()> {
    let main_window_config = app
        .config()
        .app
        .windows
        .iter()
        .find(|window| window.label == "main")
        .ok_or_else(|| std::io::Error::other("main desktop webview configuration is missing"))?;
    WebviewWindowBuilder::from_config(app.handle(), main_window_config)?
        .on_navigation(is_allowed_main_navigation)
        .on_new_window(|_, _| NewWindowResponse::Deny)
        .build()?;
    Ok(())
}

fn is_allowed_main_navigation(url: &Url) -> bool {
    is_allowed_main_navigation_for_environment(url, cfg!(debug_assertions))
}

fn is_allowed_main_navigation_for_environment(url: &Url, is_development: bool) -> bool {
    matches!(
        url,
        url if matches!(url.scheme(), "tauri" | "asset")
            || (url.scheme() == "http" && url.host_str() == Some("tauri.localhost"))
    ) || (is_development
        && url.scheme() == "http"
        && url.host_str() == Some("localhost")
        && url.port_or_known_default() == Some(5173))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn main_webview_navigation_allows_only_bundled_or_exact_development_origins() {
        assert!(is_allowed_main_navigation_for_environment(
            &"tauri://localhost/index.html".parse().expect("valid bundled URL"),
            false,
        ));
        assert!(is_allowed_main_navigation_for_environment(
            &"http://localhost:5173/".parse().expect("valid Vite URL"),
            true,
        ));
        assert!(!is_allowed_main_navigation_for_environment(
            &"https://example.test/".parse().expect("valid external URL"),
            true,
        ));
        assert!(!is_allowed_main_navigation_for_environment(
            &"http://localhost:4173/".parse().expect("valid wrong-port URL"),
            true,
        ));
    }
}

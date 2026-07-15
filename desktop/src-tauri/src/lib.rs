mod bridge;
mod local_terminal;
mod menu;

use tauri::Manager;

pub use bridge::{desktop_capabilities, desktop_system_theme, format_window_title, SafeFileRegistry};
pub use local_terminal::LocalTerminalRegistry;

use bridge::{
    desktop_open_external_url, desktop_open_saved_file, desktop_reveal_saved_file,
    desktop_save_file, desktop_set_active_cluster_title,
};
use local_terminal::{
    desktop_local_terminal_close, desktop_local_terminal_input, desktop_local_terminal_resize,
    desktop_local_terminal_start,
};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        // Browser links are intentionally not intercepted by the plugin. Every
        // external navigation goes through the typed, HTTP(S)-validated bridge.
        .plugin(tauri_plugin_opener::Builder::new().open_js_links_on_click(false).build())
        .manage(SafeFileRegistry::default())
        .manage(LocalTerminalRegistry::default())
        .setup(|app| {
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
        ])
        .build(tauri::generate_context!())
        .expect("Opsia desktop shell failed to build");
    app.run(|app_handle, event| {
        if matches!(event, tauri::RunEvent::ExitRequested { .. } | tauri::RunEvent::Exit) {
            app_handle.state::<LocalTerminalRegistry>().close_all();
        }
    });
}

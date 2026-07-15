mod bridge;
mod menu;

pub use bridge::{desktop_capabilities, desktop_system_theme, format_window_title, SafeFileRegistry};

use bridge::{
    desktop_open_external_url, desktop_open_saved_file, desktop_reveal_saved_file,
    desktop_save_file, desktop_set_active_cluster_title,
};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        // Browser links are intentionally not intercepted by the plugin. Every
        // external navigation goes through the typed, HTTP(S)-validated bridge.
        .plugin(tauri_plugin_opener::Builder::new().open_js_links_on_click(false).build())
        .manage(SafeFileRegistry::default())
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
        ])
        .run(tauri::generate_context!())
        .expect("Opsia desktop shell failed to start");
}

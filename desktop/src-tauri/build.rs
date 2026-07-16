const DESKTOP_COMMANDS: &[&str] = &[
    "desktop_capabilities",
    "desktop_set_active_cluster_title",
    "desktop_open_external_url",
    "desktop_save_file",
    "desktop_open_saved_file",
    "desktop_reveal_saved_file",
    "desktop_system_theme",
    "desktop_local_terminal_start",
    "desktop_local_terminal_input",
    "desktop_local_terminal_resize",
    "desktop_local_terminal_close",
    "desktop_local_terminal_ack_output",
    "desktop_port_forward_sessions",
    "desktop_port_forward_stop",
];

fn main() {
    tauri_build::try_build(
        tauri_build::Attributes::new()
            .app_manifest(tauri_build::AppManifest::new().commands(DESKTOP_COMMANDS)),
    )
    .expect("failed to build the desktop capability manifest");
}

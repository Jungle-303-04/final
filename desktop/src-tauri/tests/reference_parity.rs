use opsia_desktop::{desktop_capabilities, format_window_title};

#[test]
fn desktop_foundation_keeps_the_active_cluster_in_the_window_title() {
    assert_eq!(format_window_title(Some("production")), "Opsia — production");
    assert_eq!(format_window_title(None), "Opsia");
}

#[test]
fn native_local_pty_and_unavailable_updater_are_honest_capabilities() {
    let capabilities = desktop_capabilities();
    assert_eq!(format!("{:?}", capabilities.local_terminal.state), "Available");
    assert_eq!(format!("{:?}", capabilities.updater.state), "Unsupported");
}

#[test]
fn main_window_grants_only_the_registered_local_pty_commands() {
    let build_manifest = include_str!("../build.rs");
    let capability = include_str!("../capabilities/default.json");
    for command in [
        "desktop_local_terminal_start",
        "desktop_local_terminal_input",
        "desktop_local_terminal_resize",
        "desktop_local_terminal_close",
    ] {
        assert!(build_manifest.contains(command), "{command} must be registered");
        assert!(
            capability.contains(&format!("allow-{}", command.replace('_', "-"))),
            "{command} must be granted only to the main window"
        );
    }
}

#[test]
fn desktop_build_uses_the_shared_frontend_from_the_desktop_working_directory() {
    let config = include_str!("../tauri.conf.json");

    assert!(config.contains("\"beforeDevCommand\": \"npm --prefix ../frontend run dev\""));
    assert!(config.contains("\"beforeBuildCommand\": \"npm --prefix ../frontend run build\""));
    assert!(config.contains("\"active\": true"));
}

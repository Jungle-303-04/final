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
        "desktop_local_terminal_ack_output",
    ] {
        assert!(build_manifest.contains(command), "{command} must be registered");
        assert!(
            capability.contains(&format!("allow-{}", command.replace('_', "-"))),
            "{command} must be granted only to the main window"
        );
    }
}

#[test]
fn main_window_grants_the_validated_external_url_command() {
    let build_manifest = include_str!("../build.rs");
    let capability = include_str!("../capabilities/default.json");

    assert!(build_manifest.contains("desktop_open_external_url"));
    assert!(capability.contains("allow-desktop-open-external-url"));
    assert!(!capability.contains("opener:allow-open-url"));
}

#[test]
fn desktop_build_uses_the_shared_frontend_from_the_desktop_working_directory() {
    let config = include_str!("../tauri.conf.json");

    assert!(config.contains("\"beforeDevCommand\": \"npm --prefix ../frontend run dev\""));
    assert!(config.contains("\"beforeBuildCommand\": \"npm --prefix ../frontend run build\""));
    assert!(config.contains("\"active\": true"));
    assert!(config.contains("\"create\": false"));
    assert!(config.contains("\"withGlobalTauri\": false"));
    assert!(config.contains("\"freezePrototype\": true"));
    assert!(config.contains("\"csp\":"));
    assert!(config.contains("\"devCsp\":"));
    assert!(!config.contains("unsafe-eval"));
}

#[test]
fn desktop_bundle_uses_the_generated_platform_icon_set() {
    let config = include_str!("../tauri.conf.json");

    for icon in [
        "icons/32x32.png",
        "icons/128x128.png",
        "icons/128x128@2x.png",
        "icons/icon.icns",
        "icons/icon.ico",
    ] {
        assert!(
            config.contains(icon),
            "desktop bundle configuration must include {icon}"
        );
    }
}

#[test]
fn desktop_capabilities_do_not_grant_a_wildcard_remote_origin() {
    let capability = include_str!("../capabilities/default.json");

    assert!(capability.contains("http://localhost:5173/*"));
    assert!(!capability.contains("https://*"));
}

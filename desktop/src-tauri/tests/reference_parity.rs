use opsia_desktop::{desktop_capabilities, format_window_title};

#[test]
fn desktop_foundation_keeps_the_active_cluster_in_the_window_title() {
    assert_eq!(format_window_title(Some("production")), "Opsia — production");
    assert_eq!(format_window_title(None), "Opsia");
}

#[test]
fn unsupported_native_features_are_honest_capabilities() {
    let capabilities = desktop_capabilities();
    assert_eq!(format!("{:?}", capabilities.local_terminal.state), "Unsupported");
    assert_eq!(format!("{:?}", capabilities.updater.state), "Unsupported");
}

#[test]
fn desktop_build_uses_the_shared_frontend_from_the_desktop_working_directory() {
    let config = include_str!("../tauri.conf.json");

    assert!(config.contains("\"beforeDevCommand\": \"npm --prefix ../frontend run dev\""));
    assert!(config.contains("\"beforeBuildCommand\": \"npm --prefix ../frontend run build\""));
    assert!(config.contains("\"active\": true"));
}

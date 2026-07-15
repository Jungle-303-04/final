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

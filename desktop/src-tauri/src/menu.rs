use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem, Submenu},
    App, AppHandle, Emitter, Runtime,
};
const SETTINGS_MENU_ID: &str = "desktop.settings";
const RELOAD_MENU_ID: &str = "desktop.reload";
const CHECK_UPDATES_MENU_ID: &str = "desktop.check-updates";

pub const MENU_EVENT: &str = "desktop:menu";

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub enum DesktopMenuAction {
    Settings,
    Reload,
}

pub fn install_native_menu(app: &App) -> tauri::Result<()> {
    let settings = MenuItem::with_id(app, SETTINGS_MENU_ID, "Settings…", true, Some("CmdOrCtrl+,"))?;
    let quit = PredefinedMenuItem::quit(app, Some("Quit"))?;
    let file = Submenu::with_items(app, "File", true, &[&settings, &quit])?;

    let undo = PredefinedMenuItem::undo(app, None)?;
    let redo = PredefinedMenuItem::redo(app, None)?;
    let cut = PredefinedMenuItem::cut(app, None)?;
    let copy = PredefinedMenuItem::copy(app, None)?;
    let paste = PredefinedMenuItem::paste(app, None)?;
    let select_all = PredefinedMenuItem::select_all(app, None)?;
    let edit = Submenu::with_items(
        app,
        "Edit",
        true,
        &[&undo, &redo, &cut, &copy, &paste, &select_all],
    )?;

    let reload = MenuItem::with_id(
        app,
        RELOAD_MENU_ID,
        "Reload",
        true,
        Some(reload_accelerator_for(std::env::consts::OS)),
    )?;
    let zoom_in = MenuItem::with_id(app, "desktop.zoom-in", "Zoom In", true, Some("CmdOrCtrl+="))?;
    let zoom_out = MenuItem::with_id(app, "desktop.zoom-out", "Zoom Out", true, Some("CmdOrCtrl+-"))?;
    let zoom_reset = MenuItem::with_id(app, "desktop.zoom-reset", "Actual Size", true, Some("CmdOrCtrl+0"))?;
    let view = Submenu::with_items(app, "View", true, &[&reload, &zoom_in, &zoom_out, &zoom_reset])?;

    // Until a signed update feed exists, the item is visible but disabled. It
    // cannot emit a misleading success event or fall back to a Python route.
    let check_updates = MenuItem::with_id(app, CHECK_UPDATES_MENU_ID, "Check for Updates…", false, None::<&str>)?;
    let help = Submenu::with_items(app, "Help", true, &[&check_updates])?;

    let menu = Menu::with_items(app, &[&file, &edit, &view, &help])?;
    app.set_menu(menu)?;
    app.on_menu_event(handle_menu_event);
    Ok(())
}

fn handle_menu_event<R: Runtime>(app: &AppHandle<R>, event: tauri::menu::MenuEvent) {
    match event.id().as_ref() {
        SETTINGS_MENU_ID => emit_menu_action(app, DesktopMenuAction::Settings),
        RELOAD_MENU_ID => emit_menu_action(app, DesktopMenuAction::Reload),
        _ => {}
    }
}

fn emit_menu_action<R: Runtime>(app: &AppHandle<R>, action: DesktopMenuAction) {
    let _ = app.emit(MENU_EVENT, action);
}

pub fn reload_accelerator_for(platform: &str) -> &'static str {
    if platform == "macos" {
        "CmdOrCtrl+R"
    } else {
        "Ctrl+Shift+R"
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reload_never_claims_ctrl_r_off_macos() {
        assert_eq!(reload_accelerator_for("macos"), "CmdOrCtrl+R");
        assert_eq!(reload_accelerator_for("windows"), "Ctrl+Shift+R");
        assert_eq!(reload_accelerator_for("linux"), "Ctrl+Shift+R");
    }
}

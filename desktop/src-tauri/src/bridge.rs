use std::{
    collections::HashMap,
    path::{Path, PathBuf},
    sync::Mutex,
};

#[cfg(not(unix))]
use std::fs;

use base64::{engine::general_purpose::STANDARD as BASE64, Engine};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, State, Theme, WebviewWindow};
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_opener::OpenerExt;
use url::Url;
use uuid::Uuid;

const PRODUCT_NAME: &str = "Opsia";
const MAX_SAVE_FILE_BYTES: usize = 100 * 1024 * 1024;

const LOCAL_TERMINAL_BLOCKER: &str =
    "Local PTY is not implemented. It must remain inside the local Tauri process and never proxy through Python.";
const UPDATER_BLOCKER: &str =
    "Updater is not implemented because signed release metadata and platform signing keys are not configured.";

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct DesktopCapabilitySet {
    pub platform: DesktopPlatform,
    pub active_cluster_title: CapabilityAvailability,
    pub native_menu: CapabilityAvailability,
    pub system_theme: CapabilityAvailability,
    pub external_url: CapabilityAvailability,
    pub safe_file: CapabilityAvailability,
    pub local_terminal: CapabilityAvailability,
    pub updater: CapabilityAvailability,
}

impl DesktopCapabilitySet {
    fn native() -> Self {
        Self {
            platform: DesktopPlatform::current(),
            active_cluster_title: CapabilityAvailability::available(),
            native_menu: CapabilityAvailability::available(),
            system_theme: CapabilityAvailability::available(),
            external_url: CapabilityAvailability::available(),
            safe_file: CapabilityAvailability::available(),
            local_terminal: CapabilityAvailability::unsupported(LOCAL_TERMINAL_BLOCKER),
            updater: CapabilityAvailability::unsupported(UPDATER_BLOCKER),
        }
    }
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum DesktopPlatform {
    Macos,
    Windows,
    Linux,
}

impl DesktopPlatform {
    fn current() -> Self {
        #[cfg(target_os = "macos")]
        return Self::Macos;
        #[cfg(target_os = "windows")]
        return Self::Windows;
        #[cfg(target_os = "linux")]
        return Self::Linux;
        #[allow(unreachable_code)]
        Self::Linux
    }
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct CapabilityAvailability {
    pub state: CapabilityState,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reason: Option<&'static str>,
}

impl CapabilityAvailability {
    fn available() -> Self {
        Self {
            state: CapabilityState::Available,
            reason: None,
        }
    }

    fn unsupported(reason: &'static str) -> Self {
        Self {
            state: CapabilityState::Unsupported,
            reason: Some(reason),
        }
    }
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum CapabilityState {
    Available,
    Unsupported,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ActiveClusterTitleRequest {
    pub cluster_id: Option<String>,
    pub display_name: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct OpenExternalUrlRequest {
    pub url: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveFileRequest {
    pub filename: String,
    #[serde(default)]
    pub content: Option<String>,
    #[serde(default)]
    pub content_base64: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SavedFileRequest {
    pub handle_id: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SavedFileHandle {
    pub handle_id: String,
    pub filename: String,
}

#[derive(Debug, Serialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum SaveFileResult {
    Saved { file: SavedFileHandle },
    Cancelled,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum DesktopTheme {
    Light,
    Dark,
    Unknown,
}

#[derive(Default)]
pub struct SafeFileRegistry {
    paths: Mutex<HashMap<String, PathBuf>>,
}

impl SafeFileRegistry {
    fn insert(&self, path: PathBuf, filename: String) -> Result<SavedFileHandle, String> {
        let handle_id = Uuid::new_v4().to_string();
        let mut paths = self
            .paths
            .lock()
            .map_err(|_| "safe file registry is unavailable".to_owned())?;
        paths.insert(handle_id.clone(), path);
        Ok(SavedFileHandle {
            handle_id,
            filename,
        })
    }

    fn resolve(&self, handle_id: &str) -> Result<PathBuf, String> {
        if Uuid::parse_str(handle_id).is_err() {
            return Err("invalid saved file handle".to_owned());
        }
        let paths = self
            .paths
            .lock()
            .map_err(|_| "safe file registry is unavailable".to_owned())?;
        paths
            .get(handle_id)
            .cloned()
            .ok_or_else(|| "saved file handle is unknown or expired".to_owned())
    }
}

#[tauri::command]
pub fn desktop_capabilities() -> DesktopCapabilitySet {
    DesktopCapabilitySet::native()
}

#[tauri::command]
pub fn desktop_set_active_cluster_title(
    window: WebviewWindow,
    request: ActiveClusterTitleRequest,
) -> Result<(), String> {
    let title = match request.cluster_id.as_deref().filter(|id| !id.trim().is_empty()) {
        Some(_) => format_window_title(request.display_name.as_deref()),
        None => PRODUCT_NAME.to_owned(),
    };
    window.set_title(&title).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn desktop_open_external_url(
    app: AppHandle,
    request: OpenExternalUrlRequest,
) -> Result<(), String> {
    let url = parse_external_http_url(&request.url)?;
    app.opener()
        .open_url(url.as_str(), None::<&str>)
        .map_err(|error| format!("failed to open external URL: {error}"))
}

#[tauri::command]
pub async fn desktop_save_file(
    app: AppHandle,
    registry: State<'_, SafeFileRegistry>,
    request: SaveFileRequest,
) -> Result<SaveFileResult, String> {
    let filename = normalized_filename(&request.filename)?;
    let content = save_content(request)?;
    let Some(path) = app
        .dialog()
        .file()
        .set_file_name(&filename)
        .blocking_save_file()
    else {
        return Ok(SaveFileResult::Cancelled);
    };
    let path = path
        .into_path()
        .map_err(|error| format!("selected save path is unavailable: {error}"))?;
    write_selected_file(&path, &content)?;
    let file = registry.insert(path, filename)?;
    Ok(SaveFileResult::Saved { file })
}

#[tauri::command]
pub fn desktop_open_saved_file(
    app: AppHandle,
    registry: State<'_, SafeFileRegistry>,
    request: SavedFileRequest,
) -> Result<(), String> {
    let path = registry.resolve(&request.handle_id)?;
    app.opener()
        .open_path(path.to_string_lossy(), None::<&str>)
        .map_err(|error| format!("failed to open saved file: {error}"))
}

#[tauri::command]
pub fn desktop_reveal_saved_file(
    app: AppHandle,
    registry: State<'_, SafeFileRegistry>,
    request: SavedFileRequest,
) -> Result<(), String> {
    let path = registry.resolve(&request.handle_id)?;
    app.opener()
        .reveal_item_in_dir(path)
        .map_err(|error| format!("failed to reveal saved file: {error}"))
}

#[tauri::command]
pub fn desktop_system_theme(window: WebviewWindow) -> Result<DesktopTheme, String> {
    window
        .theme()
        .map(|theme| match theme {
            Theme::Light => DesktopTheme::Light,
            Theme::Dark => DesktopTheme::Dark,
            _ => DesktopTheme::Unknown,
        })
        .map_err(|error| error.to_string())
}

pub fn format_window_title(display_name: Option<&str>) -> String {
    let display_name = display_name
        .map(safe_title_text)
        .filter(|value| !value.is_empty());
    match display_name {
        Some(display_name) => format!("{PRODUCT_NAME} — {display_name}"),
        None => PRODUCT_NAME.to_owned(),
    }
}

fn parse_external_http_url(value: &str) -> Result<Url, String> {
    let url = Url::parse(value.trim()).map_err(|_| "external URL must be valid".to_owned())?;
    if !matches!(url.scheme(), "http" | "https")
        || url.host_str().is_none()
        || !url.username().is_empty()
        || url.password().is_some()
    {
        return Err("external URL must be an absolute HTTP(S) URL without credentials".to_owned());
    }
    Ok(url)
}

fn normalized_filename(value: &str) -> Result<String, String> {
    if value.contains('\0') {
        return Err("save filename contains a null byte".to_owned());
    }
    let filename = Path::new(value)
        .file_name()
        .and_then(|candidate| candidate.to_str())
        .map(str::trim)
        .filter(|candidate| !candidate.is_empty() && *candidate != "." && *candidate != "..")
        .ok_or_else(|| "save filename is required".to_owned())?;
    Ok(filename.to_owned())
}

fn save_content(request: SaveFileRequest) -> Result<Vec<u8>, String> {
    let content = match (request.content, request.content_base64) {
        (Some(_), Some(_)) => return Err("provide content or contentBase64, not both".to_owned()),
        (Some(content), None) => content.into_bytes(),
        (None, Some(content_base64)) => BASE64
            .decode(content_base64)
            .map_err(|_| "contentBase64 is invalid".to_owned())?,
        (None, None) => return Err("content or contentBase64 is required".to_owned()),
    };
    if content.len() > MAX_SAVE_FILE_BYTES {
        return Err("save content exceeds the desktop size limit".to_owned());
    }
    Ok(content)
}

fn write_selected_file(path: &Path, content: &[u8]) -> Result<(), String> {
    #[cfg(unix)]
    {
        use std::{fs::OpenOptions, io::Write, os::unix::fs::OpenOptionsExt};
        let mut file = OpenOptions::new()
            .write(true)
            .create(true)
            .truncate(true)
            .mode(0o600)
            .open(path)
            .map_err(|error| format!("failed to create selected file: {error}"))?;
        file.write_all(content)
            .map_err(|error| format!("failed to write selected file: {error}"))?;
        file.sync_all()
            .map_err(|error| format!("failed to finalize selected file: {error}"))?;
        return Ok(());
    }
    #[cfg(not(unix))]
    {
        fs::write(path, content).map_err(|error| format!("failed to write selected file: {error}"))
    }
}

fn safe_title_text(value: &str) -> String {
    value
        .chars()
        .filter(|character| !character.is_control())
        .take(120)
        .collect::<String>()
        .trim()
        .to_owned()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn title_uses_the_cluster_label_without_control_characters() {
        assert_eq!(
            format_window_title(Some("\nproduction\t")),
            "Opsia — production"
        );
        assert_eq!(format_window_title(Some("   ")), "Opsia");
    }

    #[test]
    fn external_urls_are_limited_to_credential_free_http() {
        assert!(parse_external_http_url("https://docs.example.test/guide").is_ok());
        assert!(parse_external_http_url("https://user:pass@example.test").is_err());
        assert!(parse_external_http_url("file:///tmp/report").is_err());
    }

    #[test]
    fn capability_contract_leaves_updater_and_local_pty_unavailable() {
        let capabilities = DesktopCapabilitySet::native();
        assert_eq!(capabilities.local_terminal.state, CapabilityState::Unsupported);
        assert_eq!(capabilities.updater.state, CapabilityState::Unsupported);
        assert!(capabilities.local_terminal.reason.is_some());
        assert!(capabilities.updater.reason.is_some());
    }

    #[test]
    fn save_content_requires_exactly_one_encoding() {
        assert_eq!(
            save_content(SaveFileRequest {
                filename: "report.yaml".to_owned(),
                content: Some("".to_owned()),
                content_base64: None,
            })
            .expect("empty text is a valid file"),
            Vec::<u8>::new(),
        );
        assert!(save_content(SaveFileRequest {
            filename: "report.yaml".to_owned(),
            content: Some("text".to_owned()),
            content_base64: Some("dGV4dA==".to_owned()),
        })
        .is_err());
    }
}

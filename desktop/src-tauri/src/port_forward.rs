use serde::{Deserialize, Serialize};
use tauri::{State, WebviewWindow};

const MAIN_WINDOW_LABEL: &str = "main";
pub const AGENT_TUNNEL_UNAVAILABLE: &str =
    "agent-backed port-forward tunnel is unavailable in this desktop build";

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
#[allow(dead_code)]
pub struct StartPortForwardRequest {
    pub scope: DesktopClusterScope,
    pub resource: DesktopPortForwardResourceRef,
    pub capability_revision: String,
    pub remote_port: u16,
    pub local_port: Option<u16>,
    pub listen_address: DesktopListenAddress,
    pub confirmation: bool,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
#[allow(dead_code)]
pub struct DesktopClusterScope {
    pub workspace_id: String,
    pub cluster_id: String,
    pub namespaces: Vec<String>,
    pub freshness: DesktopFreshness,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
#[allow(dead_code)]
pub struct DesktopPortForwardResourceRef {
    pub api_group: String,
    pub version: String,
    pub kind: DesktopPortForwardResourceKind,
    pub namespace: String,
    pub name: String,
    pub uid: String,
}

#[derive(Debug, Clone, Copy, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum DesktopFreshness {
    Live,
    Stale,
    Partial,
    Disconnected,
}

#[derive(Debug, Clone, Copy, Deserialize, Serialize, PartialEq, Eq)]
pub enum DesktopPortForwardResourceKind {
    Pod,
    Service,
}

#[derive(Debug, Clone, Copy, Deserialize, Serialize, PartialEq, Eq)]
pub enum DesktopListenAddress {
    #[serde(rename = "127.0.0.1")]
    Loopback,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct DesktopPortForwardSession {
    pub id: String,
    pub workspace_id: String,
    pub cluster_id: String,
    pub freshness: DesktopFreshness,
    pub namespace: String,
    pub resource_kind: DesktopPortForwardResourceKind,
    pub resource_name: String,
    pub resource_uid: String,
    pub pod_name: Option<String>,
    pub pod_port: u16,
    pub local_port: u16,
    pub listen_address: DesktopListenAddress,
    pub service_name: Option<String>,
    pub service_port: Option<u16>,
    pub scheme: Option<String>,
    pub started_at: String,
    pub status: DesktopPortForwardStatus,
    pub error: Option<String>,
    pub exit_code: Option<i32>,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
#[allow(dead_code)]
pub enum DesktopPortForwardStatus {
    Starting,
    Running,
    Stopped,
    Error,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct PortForwardStartReceipt {
    pub session_id: String,
    pub generation: u64,
    pub local_port: u16,
    pub started_at: String,
}

/// Fail-closed placeholder for the future native loopback listener registry.
///
/// A desktop process is not cluster authority. No target session is created
/// until this registry is connected to the typed gateway-to-agent transport.
#[derive(Clone, Default)]
pub struct PortForwardSessionRegistry;

impl PortForwardSessionRegistry {
    pub fn close_owner(&self, _owner_window: &str) {}

    pub fn close_all(&self) {}
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StopPortForwardRequest {
    pub session_id: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RecreatePortForwardRequest {
    pub session_id: String,
    pub confirmation: bool,
}

#[tauri::command]
pub async fn desktop_port_forward_start(
    window: WebviewWindow,
    _registry: State<'_, PortForwardSessionRegistry>,
    _request: StartPortForwardRequest,
) -> Result<PortForwardStartReceipt, String> {
    require_main_window(&window)?;
    validate_start_request(&_request)?;
    Err(AGENT_TUNNEL_UNAVAILABLE.to_owned())
}

#[tauri::command]
pub fn desktop_port_forward_sessions(
    window: WebviewWindow,
    _registry: State<'_, PortForwardSessionRegistry>,
) -> Result<Vec<DesktopPortForwardSession>, String> {
    require_main_window(&window)?;
    Ok(Vec::new())
}

#[tauri::command]
pub fn desktop_port_forward_stop(
    window: WebviewWindow,
    _registry: State<'_, PortForwardSessionRegistry>,
    request: StopPortForwardRequest,
) -> Result<(), String> {
    require_main_window(&window)?;
    require_session_id(&request.session_id)?;
    Err(AGENT_TUNNEL_UNAVAILABLE.to_owned())
}

#[tauri::command]
pub async fn desktop_port_forward_recreate(
    window: WebviewWindow,
    _registry: State<'_, PortForwardSessionRegistry>,
    request: RecreatePortForwardRequest,
) -> Result<PortForwardStartReceipt, String> {
    require_main_window(&window)?;
    require_session_id(&request.session_id)?;
    if !request.confirmation {
        return Err("port-forward recreate requires confirmation".to_owned());
    }
    Err(AGENT_TUNNEL_UNAVAILABLE.to_owned())
}

fn require_session_id(session_id: &str) -> Result<(), String> {
    if session_id.trim().is_empty() || session_id.len() > 64 {
        return Err("invalid port-forward session id".to_owned());
    }
    Ok(())
}

fn validate_start_request(request: &StartPortForwardRequest) -> Result<(), String> {
    if request.capability_revision.len() != 64
        || !request
            .capability_revision
            .bytes()
            .all(|value| value.is_ascii_digit() || (b'a'..=b'f').contains(&value))
    {
        return Err("invalid port-forward capability revision".to_owned());
    }
    if !request.confirmation {
        return Err("port-forward start requires confirmation".to_owned());
    }
    Ok(())
}

fn require_main_window(window: &WebviewWindow) -> Result<(), String> {
    if window.label() == MAIN_WINDOW_LABEL {
        Ok(())
    } else {
        Err("native port-forward commands are restricted to the main window".to_owned())
    }
}

#[cfg(test)]
mod tests;

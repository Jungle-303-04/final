use std::{collections::HashMap, sync::Mutex};

use serde::{Deserialize, Serialize};
use tauri::{State, WebviewWindow};
use uuid::Uuid;

type StopAction = Box<dyn FnOnce() + Send + 'static>;

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct DesktopPortForwardSession {
    pub id: String,
    pub cluster_id: String,
    pub namespace: String,
    pub pod_name: String,
    pub pod_port: u16,
    pub local_port: u16,
    pub listen_address: DesktopListenAddress,
    pub service_name: Option<String>,
    pub service_port: Option<u16>,
    pub scheme: Option<DesktopForwardScheme>,
    pub started_at: String,
    pub status: DesktopPortForwardStatus,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[allow(dead_code)]
pub enum DesktopListenAddress {
    #[serde(rename = "127.0.0.1")]
    Loopback,
    #[serde(rename = "0.0.0.0")]
    AllInterfaces,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
#[allow(dead_code)]
pub enum DesktopForwardScheme {
    Http,
    Https,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
#[allow(dead_code)]
pub enum DesktopPortForwardStatus {
    Running,
    Stopped,
    Error,
}

struct OwnedPortForwardSession {
    owner_window: String,
    session: DesktopPortForwardSession,
    stop: Option<StopAction>,
}

#[derive(Default)]
pub struct PortForwardSessionRegistry {
    sessions: Mutex<HashMap<String, OwnedPortForwardSession>>,
}

impl PortForwardSessionRegistry {
    /// Registers a native listener together with the action that terminates it.
    /// The Python gateway never receives this local process handle.
    #[allow(dead_code)]
    pub(crate) fn register(
        &self,
        owner_window: &str,
        session: DesktopPortForwardSession,
        stop: StopAction,
    ) -> Result<(), String> {
        validate_session(&session)?;
        let id = session.id.clone();
        let mut sessions = self
            .sessions
            .lock()
            .map_err(|_| "port-forward registry is unavailable".to_owned())?;
        if sessions.contains_key(&id) {
            return Err("port-forward session already exists".to_owned());
        }
        sessions.insert(
            id,
            OwnedPortForwardSession {
                owner_window: owner_window.to_owned(),
                session,
                stop: Some(stop),
            },
        );
        Ok(())
    }

    fn list(&self, owner_window: &str) -> Result<Vec<DesktopPortForwardSession>, String> {
        let sessions = self
            .sessions
            .lock()
            .map_err(|_| "port-forward registry is unavailable".to_owned())?;
        let mut visible = sessions
            .values()
            .filter(|owned| owned.owner_window == owner_window)
            .map(|owned| owned.session.clone())
            .collect::<Vec<_>>();
        visible.sort_by(|left, right| {
            left.started_at
                .cmp(&right.started_at)
                .then_with(|| left.id.cmp(&right.id))
        });
        Ok(visible)
    }

    fn stop(&self, owner_window: &str, session_id: &str) -> Result<(), String> {
        validate_session_id(session_id)?;
        let mut sessions = self
            .sessions
            .lock()
            .map_err(|_| "port-forward registry is unavailable".to_owned())?;
        let belongs_to_owner = sessions
            .get(session_id)
            .is_some_and(|owned| owned.owner_window == owner_window);
        if !belongs_to_owner {
            return Err("port-forward session is unknown or belongs to another window".to_owned());
        }
        let mut owned = sessions
            .remove(session_id)
            .ok_or_else(|| "port-forward session is unknown or expired".to_owned())?;
        drop(sessions);
        if let Some(stop) = owned.stop.take() {
            stop();
        }
        Ok(())
    }

    pub fn close_all(&self) {
        let Ok(mut sessions) = self.sessions.lock() else {
            return;
        };
        let owned = sessions.drain().map(|(_, owned)| owned).collect::<Vec<_>>();
        drop(sessions);
        for mut session in owned {
            if let Some(stop) = session.stop.take() {
                stop();
            }
        }
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StopPortForwardRequest {
    pub session_id: String,
}

#[tauri::command]
pub fn desktop_port_forward_sessions(
    window: WebviewWindow,
    registry: State<'_, PortForwardSessionRegistry>,
) -> Result<Vec<DesktopPortForwardSession>, String> {
    registry.list(window.label())
}

#[tauri::command]
pub fn desktop_port_forward_stop(
    window: WebviewWindow,
    registry: State<'_, PortForwardSessionRegistry>,
    request: StopPortForwardRequest,
) -> Result<(), String> {
    registry.stop(window.label(), &request.session_id)
}

fn validate_session(session: &DesktopPortForwardSession) -> Result<(), String> {
    validate_session_id(&session.id)?;
    if session.cluster_id.trim().is_empty()
        || session.namespace.trim().is_empty()
        || session.pod_name.trim().is_empty()
        || session.started_at.trim().is_empty()
        || session.pod_port == 0
        || session.local_port == 0
    {
        return Err("port-forward session is incomplete".to_owned());
    }
    if session.service_name.is_some() != session.service_port.is_some() {
        return Err("port-forward service identity is incomplete".to_owned());
    }
    if matches!(session.status, DesktopPortForwardStatus::Error) != session.error.is_some() {
        return Err("port-forward error state is inconsistent".to_owned());
    }
    Ok(())
}

fn validate_session_id(session_id: &str) -> Result<(), String> {
    Uuid::parse_str(session_id)
        .map(|_| ())
        .map_err(|_| "invalid port-forward session id".to_owned())
}

#[cfg(test)]
mod tests {
    use std::sync::{
        atomic::{AtomicUsize, Ordering},
        Arc,
    };

    use super::*;

    #[test]
    fn registry_lists_only_the_owner_in_canonical_order_and_stops_the_listener() {
        let registry = PortForwardSessionRegistry::default();
        let stopped = Arc::new(AtomicUsize::new(0));
        for (owner, id, started_at) in [
            (
                "main",
                "00000000-0000-4000-8000-000000000002",
                "2026-07-17T03:01:00Z",
            ),
            (
                "main",
                "00000000-0000-4000-8000-000000000001",
                "2026-07-17T03:00:00Z",
            ),
            (
                "other",
                "00000000-0000-4000-8000-000000000003",
                "2026-07-17T02:00:00Z",
            ),
        ] {
            let stopped = Arc::clone(&stopped);
            registry
                .register(owner, fixture(id, started_at), Box::new(move || {
                    stopped.fetch_add(1, Ordering::SeqCst);
                }))
                .expect("session should register");
        }

        assert_eq!(
            registry
                .list("main")
                .expect("registry should list")
                .into_iter()
                .map(|session| session.id)
                .collect::<Vec<_>>(),
            [
                "00000000-0000-4000-8000-000000000001",
                "00000000-0000-4000-8000-000000000002",
            ]
        );
        assert!(registry
            .stop("other", "00000000-0000-4000-8000-000000000001")
            .is_err());
        registry
            .stop("main", "00000000-0000-4000-8000-000000000001")
            .expect("owner should stop session");
        assert_eq!(stopped.load(Ordering::SeqCst), 1);
    }

    #[test]
    fn close_all_terminates_every_owned_listener() {
        let registry = PortForwardSessionRegistry::default();
        let stopped = Arc::new(AtomicUsize::new(0));
        let counter = Arc::clone(&stopped);
        registry
            .register(
                "main",
                fixture(
                    "00000000-0000-4000-8000-000000000001",
                    "2026-07-17T03:00:00Z",
                ),
                Box::new(move || {
                    counter.fetch_add(1, Ordering::SeqCst);
                }),
            )
            .expect("session should register");

        registry.close_all();

        assert_eq!(stopped.load(Ordering::SeqCst), 1);
        assert!(registry.list("main").expect("registry should list").is_empty());
    }

    fn fixture(id: &str, started_at: &str) -> DesktopPortForwardSession {
        DesktopPortForwardSession {
            id: id.to_owned(),
            cluster_id: "cluster-a".to_owned(),
            namespace: "shop".to_owned(),
            pod_name: "checkout-abc".to_owned(),
            pod_port: 8080,
            local_port: 18_080,
            listen_address: DesktopListenAddress::Loopback,
            service_name: Some("checkout".to_owned()),
            service_port: Some(80),
            scheme: Some(DesktopForwardScheme::Http),
            started_at: started_at.to_owned(),
            status: DesktopPortForwardStatus::Running,
            error: None,
        }
    }
}

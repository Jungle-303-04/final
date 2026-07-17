use std::{
    collections::HashMap,
    io::{BufRead, BufReader},
    net::TcpListener,
    process::{Child, Command, ExitStatus, Stdio},
    sync::{
        mpsc::{self, Receiver, RecvTimeoutError, Sender},
        Arc, Mutex,
    },
    thread,
    time::{Duration, Instant},
};

use serde::{Deserialize, Serialize};
use tauri::{State, WebviewWindow};
use time::{format_description::well_known::Rfc3339, OffsetDateTime};
use uuid::Uuid;

const KUBECTL_EXECUTABLE: &str = "kubectl";
const LOOPBACK_ADDRESS: &str = "127.0.0.1";
const MAIN_WINDOW_LABEL: &str = "main";
const DEFAULT_MAX_PORT_FORWARD_SESSIONS: usize = 8;
const START_READY_TIMEOUT: Duration = Duration::from_secs(10);
const PROCESS_POLL_INTERVAL: Duration = Duration::from_millis(50);
const STOP_TIMEOUT: Duration = Duration::from_secs(3);
const MAX_DIAGNOSTIC_BYTES: usize = 2_048;

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StartPortForwardRequest {
    pub scope: DesktopClusterScope,
    pub resource: DesktopPortForwardResourceRef,
    pub remote_port: u16,
    pub local_port: Option<u16>,
    pub listen_address: DesktopListenAddress,
    pub confirmation: bool,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DesktopClusterScope {
    pub workspace_id: String,
    pub cluster_id: String,
    pub namespaces: Vec<String>,
    pub freshness: DesktopFreshness,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
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

#[derive(Debug, Clone, PartialEq, Eq)]
struct KubectlPortForwardSpec {
    executable: String,
    args: Vec<String>,
}

#[derive(Debug, Clone)]
struct Reservation {
    session_id: String,
    generation: u64,
    local_port: u16,
    started_at: String,
}

struct OwnedPortForwardSession {
    owner_window: String,
    generation: u64,
    request: StartPortForwardRequest,
    session: DesktopPortForwardSession,
    process: Option<Arc<dyn PortForwardProcess>>,
}

struct PortForwardSessionBook {
    capacity: usize,
    next_generation: u64,
    sessions: HashMap<String, OwnedPortForwardSession>,
}

impl PortForwardSessionBook {
    fn with_capacity(capacity: usize) -> Self {
        Self {
            capacity: capacity.max(1),
            next_generation: 0,
            sessions: HashMap::new(),
        }
    }

    fn reserve(
        &mut self,
        owner_window: &str,
        request: StartPortForwardRequest,
        local_port: u16,
    ) -> Result<Reservation, String> {
        let active_sessions = self
            .sessions
            .values()
            .filter(|owned| is_active_status(&owned.session.status))
            .count();
        if active_sessions >= self.capacity {
            return Err(format!(
                "native port-forward capacity is limited to {} active sessions",
                self.capacity
            ));
        }
        self.prune_oldest_inactive_session();
        if self.local_port_is_reserved(local_port) {
            return Err(format!("local port {local_port} is already reserved"));
        }
        self.next_generation = self.next_generation.saturating_add(1).max(1);
        let generation = self.next_generation;
        let session_id = Uuid::new_v4().to_string();
        let started_at = rfc3339_now()?;
        let session = session_from_request(&session_id, &started_at, &request, local_port);
        self.sessions.insert(
            session_id.clone(),
            OwnedPortForwardSession {
                owner_window: owner_window.to_owned(),
                generation,
                request,
                session,
                process: None,
            },
        );
        Ok(Reservation {
            session_id,
            generation,
            local_port,
            started_at,
        })
    }

    fn local_port_is_reserved(&self, local_port: u16) -> bool {
        self.sessions.values().any(|owned| {
            owned.session.local_port == local_port && is_active_status(&owned.session.status)
        })
    }

    fn prune_oldest_inactive_session(&mut self) {
        if self.sessions.len() < self.capacity {
            return;
        }
        let oldest_inactive = self
            .sessions
            .iter()
            .filter(|(_, owned)| !is_active_status(&owned.session.status))
            .min_by(|left, right| {
                left.1
                    .session
                    .started_at
                    .cmp(&right.1.session.started_at)
                    .then_with(|| left.0.cmp(right.0))
            })
            .map(|(id, _)| id.clone());
        if let Some(id) = oldest_inactive {
            self.sessions.remove(&id);
        }
    }

    fn attach_process(
        &mut self,
        session_id: &str,
        generation: u64,
        process: Arc<dyn PortForwardProcess>,
    ) -> Result<(), String> {
        let owned = self.matching_mut(session_id, generation)?;
        owned.process = Some(process);
        Ok(())
    }

    fn mark_running(&mut self, session_id: &str, generation: u64) -> Result<(), String> {
        let owned = self.matching_mut(session_id, generation)?;
        owned.session.status = DesktopPortForwardStatus::Running;
        Ok(())
    }

    fn mark_exit(
        &mut self,
        session_id: &str,
        generation: u64,
        exit: ProcessExit,
        diagnostic: Option<String>,
    ) -> bool {
        let Ok(owned) = self.matching_mut(session_id, generation) else {
            return false;
        };
        owned.process = None;
        owned.session.exit_code = exit.code;
        if exit.success {
            owned.session.status = DesktopPortForwardStatus::Stopped;
            owned.session.error = None;
        } else {
            owned.session.status = DesktopPortForwardStatus::Error;
            owned.session.error = Some(
                diagnostic.unwrap_or_else(|| "kubectl port-forward exited unexpectedly".to_owned()),
            );
        }
        true
    }

    fn release_if_generation(&mut self, session_id: &str, generation: u64) -> bool {
        let matches = self
            .sessions
            .get(session_id)
            .is_some_and(|owned| owned.generation == generation);
        if matches {
            self.sessions.remove(session_id);
        }
        matches
    }

    fn matching_mut(
        &mut self,
        session_id: &str,
        generation: u64,
    ) -> Result<&mut OwnedPortForwardSession, String> {
        let owned = self
            .sessions
            .get_mut(session_id)
            .ok_or_else(|| "port-forward session is unknown or expired".to_owned())?;
        if owned.generation != generation {
            return Err("port-forward session generation is stale".to_owned());
        }
        Ok(owned)
    }
}

struct PortForwardRegistryInner {
    book: Mutex<PortForwardSessionBook>,
    process_factory: Arc<dyn PortForwardProcessFactory>,
}

#[derive(Clone)]
pub struct PortForwardSessionRegistry {
    inner: Arc<PortForwardRegistryInner>,
}

impl Default for PortForwardSessionRegistry {
    fn default() -> Self {
        Self::with_factory(
            DEFAULT_MAX_PORT_FORWARD_SESSIONS,
            Arc::new(SystemPortForwardProcessFactory),
        )
    }
}

impl PortForwardSessionRegistry {
    fn with_factory(capacity: usize, process_factory: Arc<dyn PortForwardProcessFactory>) -> Self {
        Self {
            inner: Arc::new(PortForwardRegistryInner {
                book: Mutex::new(PortForwardSessionBook::with_capacity(capacity)),
                process_factory,
            }),
        }
    }

    fn start(
        &self,
        owner_window: &str,
        request: StartPortForwardRequest,
    ) -> Result<PortForwardStartReceipt, String> {
        validate_start_request(&request)?;
        let local_port = request.local_port.unwrap_or(find_available_loopback_port()?);
        let reservation = self
            .inner
            .book
            .lock()
            .map_err(|_| "port-forward registry is unavailable".to_owned())?
            .reserve(owner_window, request.clone(), local_port)?;
        let spec = kubectl_port_forward_spec(&request, local_port)?;
        let spawned = match self.inner.process_factory.spawn(&spec) {
            Ok(spawned) => spawned,
            Err(error) => {
                self.release(&reservation);
                return Err(error);
            }
        };
        if let Err(error) = self.attach_process(&reservation, Arc::clone(&spawned.process)) {
            let _ = spawned.process.kill();
            self.release(&reservation);
            return Err(error);
        }
        let mut diagnostics = DiagnosticBuffer::default();
        if let Err(error) = wait_for_readiness(
            &spawned.process,
            &spawned.output,
            local_port,
            &mut diagnostics,
        ) {
            let _ = terminate_process(&spawned.process, STOP_TIMEOUT);
            self.release(&reservation);
            return Err(error);
        }
        self.inner
            .book
            .lock()
            .map_err(|_| "port-forward registry is unavailable".to_owned())?
            .mark_running(&reservation.session_id, reservation.generation)?;
        spawn_process_monitor(
            self.clone(),
            reservation.session_id.clone(),
            reservation.generation,
            spawned,
            diagnostics,
        );
        Ok(PortForwardStartReceipt {
            session_id: reservation.session_id,
            generation: reservation.generation,
            local_port: reservation.local_port,
            started_at: reservation.started_at,
        })
    }

    fn list(&self, owner_window: &str) -> Result<Vec<DesktopPortForwardSession>, String> {
        let book = self
            .inner
            .book
            .lock()
            .map_err(|_| "port-forward registry is unavailable".to_owned())?;
        let mut sessions = book
            .sessions
            .values()
            .filter(|owned| owned.owner_window == owner_window)
            .map(|owned| owned.session.clone())
            .collect::<Vec<_>>();
        sessions.sort_by(|left, right| {
            left.started_at
                .cmp(&right.started_at)
                .then_with(|| left.id.cmp(&right.id))
        });
        Ok(sessions)
    }

    fn stop(&self, owner_window: &str, session_id: &str) -> Result<(), String> {
        validate_session_id(session_id)?;
        let (generation, process) = {
            let book = self
                .inner
                .book
                .lock()
                .map_err(|_| "port-forward registry is unavailable".to_owned())?;
            let owned = book
                .sessions
                .get(session_id)
                .ok_or_else(|| "port-forward session is unknown or expired".to_owned())?;
            if owned.owner_window != owner_window {
                return Err("port-forward session belongs to another window".to_owned());
            }
            (owned.generation, owned.process.clone())
        };
        if let Some(process) = process {
            terminate_process(&process, STOP_TIMEOUT)?;
        }
        self.inner
            .book
            .lock()
            .map_err(|_| "port-forward registry is unavailable".to_owned())?
            .release_if_generation(session_id, generation);
        Ok(())
    }

    fn recreate(
        &self,
        owner_window: &str,
        session_id: &str,
        confirmation: bool,
    ) -> Result<PortForwardStartReceipt, String> {
        if !confirmation {
            return Err("port-forward recreate requires confirmation".to_owned());
        }
        let mut request = {
            let book = self
                .inner
                .book
                .lock()
                .map_err(|_| "port-forward registry is unavailable".to_owned())?;
            let owned = book
                .sessions
                .get(session_id)
                .ok_or_else(|| "port-forward session is unknown or expired".to_owned())?;
            if owned.owner_window != owner_window {
                return Err("port-forward session belongs to another window".to_owned());
            }
            let mut request = owned.request.clone();
            request.local_port = Some(owned.session.local_port);
            request.confirmation = true;
            request
        };
        self.stop(owner_window, session_id)?;
        request.listen_address = DesktopListenAddress::Loopback;
        self.start(owner_window, request)
    }

    pub fn close_owner(&self, owner_window: &str) {
        let owned = {
            let Ok(mut book) = self.inner.book.lock() else {
                return;
            };
            let ids = book
                .sessions
                .iter()
                .filter(|(_, owned)| owned.owner_window == owner_window)
                .map(|(id, _)| id.clone())
                .collect::<Vec<_>>();
            ids.into_iter()
                .filter_map(|id| book.sessions.remove(&id))
                .collect::<Vec<_>>()
        };
        for session in owned {
            if let Some(process) = session.process {
                let _ = process.kill();
            }
        }
    }

    pub fn close_all(&self) {
        let owned = {
            let Ok(mut book) = self.inner.book.lock() else {
                return;
            };
            std::mem::take(&mut book.sessions)
        };
        for session in owned.into_values() {
            if let Some(process) = session.process {
                let _ = process.kill();
            }
        }
    }

    fn attach_process(
        &self,
        reservation: &Reservation,
        process: Arc<dyn PortForwardProcess>,
    ) -> Result<(), String> {
        self.inner
            .book
            .lock()
            .map_err(|_| "port-forward registry is unavailable".to_owned())?
            .attach_process(&reservation.session_id, reservation.generation, process)
    }

    fn release(&self, reservation: &Reservation) {
        if let Ok(mut book) = self.inner.book.lock() {
            book.release_if_generation(&reservation.session_id, reservation.generation);
        }
    }

    fn mark_exit(
        &self,
        session_id: &str,
        generation: u64,
        exit: ProcessExit,
        diagnostic: Option<String>,
    ) {
        if let Ok(mut book) = self.inner.book.lock() {
            book.mark_exit(session_id, generation, exit, diagnostic);
        }
    }
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
    registry: State<'_, PortForwardSessionRegistry>,
    request: StartPortForwardRequest,
) -> Result<PortForwardStartReceipt, String> {
    let owner = require_port_forward_window(&window)?;
    let registry = registry.inner().clone();
    tauri::async_runtime::spawn_blocking(move || registry.start(&owner, request))
        .await
        .map_err(|error| format!("native port-forward start task failed: {error}"))?
}

#[tauri::command]
pub fn desktop_port_forward_sessions(
    window: WebviewWindow,
    registry: State<'_, PortForwardSessionRegistry>,
) -> Result<Vec<DesktopPortForwardSession>, String> {
    registry.list(&require_port_forward_window(&window)?)
}

#[tauri::command]
pub fn desktop_port_forward_stop(
    window: WebviewWindow,
    registry: State<'_, PortForwardSessionRegistry>,
    request: StopPortForwardRequest,
) -> Result<(), String> {
    registry.stop(&require_port_forward_window(&window)?, &request.session_id)
}

#[tauri::command]
pub async fn desktop_port_forward_recreate(
    window: WebviewWindow,
    registry: State<'_, PortForwardSessionRegistry>,
    request: RecreatePortForwardRequest,
) -> Result<PortForwardStartReceipt, String> {
    let owner = require_port_forward_window(&window)?;
    let registry = registry.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        registry.recreate(&owner, &request.session_id, request.confirmation)
    })
    .await
    .map_err(|error| format!("native port-forward recreate task failed: {error}"))?
}

#[derive(Debug, Clone, Copy)]
struct ProcessExit {
    code: Option<i32>,
    success: bool,
}

trait PortForwardProcess: Send + Sync {
    fn kill(&self) -> Result<(), String>;
    fn try_wait(&self) -> Result<Option<ProcessExit>, String>;
}

struct SpawnedPortForwardProcess {
    process: Arc<dyn PortForwardProcess>,
    output: Receiver<String>,
}

trait PortForwardProcessFactory: Send + Sync {
    fn spawn(&self, spec: &KubectlPortForwardSpec) -> Result<SpawnedPortForwardProcess, String>;
}

struct SystemPortForwardProcessFactory;

impl PortForwardProcessFactory for SystemPortForwardProcessFactory {
    fn spawn(&self, spec: &KubectlPortForwardSpec) -> Result<SpawnedPortForwardProcess, String> {
        let mut child = Command::new(&spec.executable)
            .args(&spec.args)
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|error| format!("failed to start kubectl port-forward: {error}"))?;
        let Some(stdout) = child.stdout.take() else {
            terminate_unregistered_child(&mut child);
            return Err("kubectl stdout pipe is unavailable".to_owned());
        };
        let Some(stderr) = child.stderr.take() else {
            terminate_unregistered_child(&mut child);
            return Err("kubectl stderr pipe is unavailable".to_owned());
        };
        let (sender, output) = mpsc::channel();
        spawn_output_reader(stdout, sender.clone());
        spawn_output_reader(stderr, sender);
        Ok(SpawnedPortForwardProcess {
            process: Arc::new(SystemPortForwardProcess {
                child: Mutex::new(child),
            }),
            output,
        })
    }
}

fn terminate_unregistered_child(child: &mut Child) {
    let _ = child.kill();
    let _ = child.wait();
}

struct SystemPortForwardProcess {
    child: Mutex<Child>,
}

impl PortForwardProcess for SystemPortForwardProcess {
    fn kill(&self) -> Result<(), String> {
        let mut child = self
            .child
            .lock()
            .map_err(|_| "kubectl process is unavailable".to_owned())?;
        if child
            .try_wait()
            .map_err(|error| format!("failed to inspect kubectl process: {error}"))?
            .is_some()
        {
            return Ok(());
        }
        child
            .kill()
            .map_err(|error| format!("failed to stop kubectl port-forward: {error}"))
    }

    fn try_wait(&self) -> Result<Option<ProcessExit>, String> {
        self.child
            .lock()
            .map_err(|_| "kubectl process is unavailable".to_owned())?
            .try_wait()
            .map(|status| status.map(process_exit))
            .map_err(|error| format!("failed to inspect kubectl process: {error}"))
    }
}

fn spawn_output_reader(reader: impl std::io::Read + Send + 'static, sender: Sender<String>) {
    thread::spawn(move || {
        for line in BufReader::new(reader).lines() {
            let Ok(line) = line else {
                return;
            };
            if sender.send(line).is_err() {
                return;
            }
        }
    });
}

fn wait_for_readiness(
    process: &Arc<dyn PortForwardProcess>,
    output: &Receiver<String>,
    local_port: u16,
    diagnostics: &mut DiagnosticBuffer,
) -> Result<(), String> {
    let deadline = Instant::now() + START_READY_TIMEOUT;
    let marker = format!("Forwarding from {LOOPBACK_ADDRESS}:{local_port} ->");
    loop {
        match output.recv_timeout(PROCESS_POLL_INTERVAL) {
            Ok(line) => {
                if line.contains(&marker) {
                    return Ok(());
                }
                diagnostics.push(&line);
            }
            Err(RecvTimeoutError::Timeout) => {}
            Err(RecvTimeoutError::Disconnected) => {}
        }
        if let Some(exit) = process.try_wait()? {
            return Err(diagnostics.failure_message(exit, "kubectl exited before binding the port"));
        }
        if Instant::now() >= deadline {
            return Err(diagnostics.message_or("kubectl port-forward readiness timed out"));
        }
    }
}

fn spawn_process_monitor(
    registry: PortForwardSessionRegistry,
    session_id: String,
    generation: u64,
    spawned: SpawnedPortForwardProcess,
    mut diagnostics: DiagnosticBuffer,
) {
    thread::spawn(move || loop {
        match spawned.output.recv_timeout(PROCESS_POLL_INTERVAL) {
            Ok(line) => diagnostics.push(&line),
            Err(RecvTimeoutError::Timeout | RecvTimeoutError::Disconnected) => {}
        }
        match spawned.process.try_wait() {
            Ok(Some(exit)) => {
                let diagnostic = if exit.success {
                    None
                } else {
                    Some(diagnostics.message_or("kubectl port-forward exited unexpectedly"))
                };
                registry.mark_exit(&session_id, generation, exit, diagnostic);
                return;
            }
            Ok(None) => {}
            Err(error) => {
                registry.mark_exit(
                    &session_id,
                    generation,
                    ProcessExit {
                        code: None,
                        success: false,
                    },
                    Some(error),
                );
                return;
            }
        }
    });
}

fn terminate_process(
    process: &Arc<dyn PortForwardProcess>,
    timeout: Duration,
) -> Result<(), String> {
    if process.try_wait()?.is_some() {
        return Ok(());
    }
    process.kill()?;
    let deadline = Instant::now() + timeout;
    loop {
        if process.try_wait()?.is_some() {
            return Ok(());
        }
        if Instant::now() >= deadline {
            return Err("kubectl port-forward did not exit after termination".to_owned());
        }
        thread::sleep(PROCESS_POLL_INTERVAL);
    }
}

#[derive(Default)]
struct DiagnosticBuffer {
    value: String,
}

impl DiagnosticBuffer {
    fn push(&mut self, line: &str) {
        let line = sanitize_diagnostic(line);
        if line.is_empty() {
            return;
        }
        if !self.value.is_empty() {
            self.value.push(' ');
        }
        self.value.push_str(&line);
        if self.value.len() > MAX_DIAGNOSTIC_BYTES {
            let mut keep_from = self.value.len() - MAX_DIAGNOSTIC_BYTES;
            while !self.value.is_char_boundary(keep_from) {
                keep_from += 1;
            }
            self.value = self.value[keep_from..].to_owned();
        }
    }

    fn message_or(&self, fallback: &str) -> String {
        if self.value.is_empty() {
            fallback.to_owned()
        } else {
            self.value.clone()
        }
    }

    fn failure_message(&self, exit: ProcessExit, fallback: &str) -> String {
        let detail = self.message_or(fallback);
        match exit.code {
            Some(code) => format!("{detail} (exit {code})"),
            None => detail,
        }
    }
}

fn kubectl_port_forward_spec(
    request: &StartPortForwardRequest,
    local_port: u16,
) -> Result<KubectlPortForwardSpec, String> {
    validate_start_request(request)?;
    let kind = match request.resource.kind {
        DesktopPortForwardResourceKind::Pod => "pod",
        DesktopPortForwardResourceKind::Service => "service",
    };
    Ok(KubectlPortForwardSpec {
        executable: KUBECTL_EXECUTABLE.to_owned(),
        args: vec![
            "--context".to_owned(),
            request.scope.cluster_id.clone(),
            "--namespace".to_owned(),
            request.resource.namespace.clone(),
            "port-forward".to_owned(),
            format!("{kind}/{}", request.resource.name),
            format!("{local_port}:{}", request.remote_port),
            "--address".to_owned(),
            LOOPBACK_ADDRESS.to_owned(),
        ],
    })
}

fn validate_start_request(request: &StartPortForwardRequest) -> Result<(), String> {
    if !request.confirmation {
        return Err("native port-forward requires confirmation".to_owned());
    }
    if !matches!(request.listen_address, DesktopListenAddress::Loopback) {
        return Err("native port-forward is restricted to 127.0.0.1".to_owned());
    }
    if invalid_argument(&request.scope.workspace_id, 240)
        || invalid_argument(&request.scope.cluster_id, 240)
        || invalid_argument(&request.resource.uid, 240)
    {
        return Err("port-forward scope or resource identity is invalid".to_owned());
    }
    if request.resource.api_group != "" && request.resource.api_group != "core" {
        return Err("port-forward requires a core API resource".to_owned());
    }
    if request.resource.version != "v1" {
        return Err("port-forward requires a core/v1 resource".to_owned());
    }
    if request.remote_port == 0 || request.local_port == Some(0) {
        return Err("port-forward ports must be between 1 and 65535".to_owned());
    }
    if !valid_dns_label(&request.resource.namespace)
        || match request.resource.kind {
            DesktopPortForwardResourceKind::Service => !valid_dns_label(&request.resource.name),
            DesktopPortForwardResourceKind::Pod => !valid_dns_subdomain(&request.resource.name),
        }
    {
        return Err("port-forward resource name or namespace is invalid".to_owned());
    }
    if !request.scope.namespaces.is_empty()
        && !request
            .scope
            .namespaces
            .contains(&request.resource.namespace)
    {
        return Err("port-forward target is outside the selected namespace scope".to_owned());
    }
    if request.scope.namespaces.iter().any(|namespace| !valid_dns_label(namespace))
        || request.scope.namespaces.len()
            != request
                .scope
                .namespaces
                .iter()
                .collect::<std::collections::HashSet<_>>()
                .len()
    {
        return Err("port-forward namespace scope is invalid".to_owned());
    }
    Ok(())
}

fn session_from_request(
    session_id: &str,
    started_at: &str,
    request: &StartPortForwardRequest,
    local_port: u16,
) -> DesktopPortForwardSession {
    let is_pod = matches!(request.resource.kind, DesktopPortForwardResourceKind::Pod);
    DesktopPortForwardSession {
        id: session_id.to_owned(),
        workspace_id: request.scope.workspace_id.clone(),
        cluster_id: request.scope.cluster_id.clone(),
        freshness: request.scope.freshness,
        namespace: request.resource.namespace.clone(),
        resource_kind: request.resource.kind,
        resource_name: request.resource.name.clone(),
        resource_uid: request.resource.uid.clone(),
        pod_name: is_pod.then(|| request.resource.name.clone()),
        pod_port: request.remote_port,
        local_port,
        listen_address: DesktopListenAddress::Loopback,
        service_name: (!is_pod).then(|| request.resource.name.clone()),
        service_port: (!is_pod).then_some(request.remote_port),
        scheme: None,
        started_at: started_at.to_owned(),
        status: DesktopPortForwardStatus::Starting,
        error: None,
        exit_code: None,
    }
}

fn is_active_status(status: &DesktopPortForwardStatus) -> bool {
    matches!(
        status,
        DesktopPortForwardStatus::Starting | DesktopPortForwardStatus::Running
    )
}

fn find_available_loopback_port() -> Result<u16, String> {
    TcpListener::bind((LOOPBACK_ADDRESS, 0))
        .and_then(|listener| listener.local_addr())
        .map(|address| address.port())
        .map_err(|error| format!("failed to allocate a local loopback port: {error}"))
}

fn rfc3339_now() -> Result<String, String> {
    OffsetDateTime::now_utc()
        .format(&Rfc3339)
        .map_err(|error| format!("failed to format port-forward start time: {error}"))
}

fn process_exit(status: ExitStatus) -> ProcessExit {
    ProcessExit {
        code: status.code(),
        success: status.success(),
    }
}

fn sanitize_diagnostic(value: &str) -> String {
    value
        .chars()
        .filter(|character| !character.is_control() || *character == '\t')
        .collect::<String>()
        .trim()
        .to_owned()
}

fn invalid_argument(value: &str, maximum_length: usize) -> bool {
    value.trim().is_empty()
        || value.len() > maximum_length
        || value.chars().any(char::is_control)
}

fn valid_dns_subdomain(value: &str) -> bool {
    if value.is_empty() || value.len() > 253 {
        return false;
    }
    value.split('.').all(|label| {
        !label.is_empty()
            && label.len() <= 63
            && label
                .chars()
                .all(|character| character.is_ascii_lowercase() || character.is_ascii_digit() || character == '-')
            && !label.starts_with('-')
            && !label.ends_with('-')
    })
}

fn valid_dns_label(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 63
        && value
            .chars()
            .all(|character| {
                character.is_ascii_lowercase() || character.is_ascii_digit() || character == '-'
            })
        && !value.starts_with('-')
        && !value.ends_with('-')
}

fn validate_session_id(session_id: &str) -> Result<(), String> {
    Uuid::parse_str(session_id)
        .map(|_| ())
        .map_err(|_| "invalid port-forward session id".to_owned())
}

fn require_port_forward_window(window: &WebviewWindow) -> Result<String, String> {
    if window.label() == MAIN_WINDOW_LABEL {
        Ok(window.label().to_owned())
    } else {
        Err("native port-forward commands are restricted to the main window".to_owned())
    }
}

#[cfg(test)]
mod tests;

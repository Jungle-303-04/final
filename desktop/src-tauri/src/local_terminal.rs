use std::{
    collections::HashMap,
    io::{Read, Write},
    path::Path,
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex,
    },
    thread,
};

use portable_pty::{
    Child, ChildKiller, CommandBuilder, MasterPty, NativePtySystem, PtySize, PtySystem,
};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, State};
use uuid::Uuid;

const LOCAL_TERMINAL_EVENT: &str = "desktop:local-terminal";
const MIN_TERMINAL_COLUMNS: u16 = 20;
const MAX_TERMINAL_COLUMNS: u16 = 500;
const MIN_TERMINAL_ROWS: u16 = 5;
const MAX_TERMINAL_ROWS: u16 = 300;
const MAX_TERMINAL_INPUT_BYTES: usize = 64 * 1024;

/// A native-only PTY session.  It never receives credentials, target-agent
/// data, or an executable path from the webview: it starts the local user's
/// login shell and is controlled only through the Tauri command boundary.
#[derive(Clone)]
pub struct LocalTerminalRegistry {
    inner: Arc<LocalTerminalRegistryInner>,
}

struct LocalTerminalRegistryInner {
    sessions: Mutex<HashMap<String, Arc<LocalTerminalSession>>>,
}

impl Default for LocalTerminalRegistry {
    fn default() -> Self {
        Self {
            inner: Arc::new(LocalTerminalRegistryInner {
                sessions: Mutex::new(HashMap::new()),
            }),
        }
    }
}

impl Drop for LocalTerminalRegistryInner {
    fn drop(&mut self) {
        let sessions = match self.sessions.lock() {
            Ok(mut sessions) => std::mem::take(&mut *sessions),
            Err(_) => return,
        };
        for session in sessions.into_values() {
            session.close();
        }
    }
}

struct LocalTerminalSession {
    master: Mutex<Box<dyn MasterPty + Send>>,
    writer: Mutex<Box<dyn Write + Send>>,
    killer: Mutex<Box<dyn ChildKiller + Send + Sync>>,
    closed: AtomicBool,
}

impl LocalTerminalRegistry {
    fn insert(&self, session_id: String, session: Arc<LocalTerminalSession>) -> Result<(), String> {
        let mut sessions = self
            .inner
            .sessions
            .lock()
            .map_err(|_| "local terminal registry is unavailable".to_owned())?;
        sessions.insert(session_id, session);
        Ok(())
    }

    fn get(&self, session_id: &str) -> Result<Arc<LocalTerminalSession>, String> {
        validate_session_id(session_id)?;
        let sessions = self
            .inner
            .sessions
            .lock()
            .map_err(|_| "local terminal registry is unavailable".to_owned())?;
        sessions
            .get(session_id)
            .cloned()
            .ok_or_else(|| "local terminal session is unknown or closed".to_owned())
    }

    fn remove(&self, session_id: &str) -> Result<Option<Arc<LocalTerminalSession>>, String> {
        let mut sessions = self
            .inner
            .sessions
            .lock()
            .map_err(|_| "local terminal registry is unavailable".to_owned())?;
        Ok(sessions.remove(session_id))
    }

    pub fn close_all(&self) {
        let sessions = match self.inner.sessions.lock() {
            Ok(mut sessions) => std::mem::take(&mut *sessions),
            Err(_) => return,
        };
        for session in sessions.into_values() {
            session.close();
        }
    }
}

impl LocalTerminalSession {
    fn resize(&self, size: PtySize) -> Result<(), String> {
        self.master
            .lock()
            .map_err(|_| "local terminal session is unavailable".to_owned())?
            .resize(size)
            .map_err(|error| format!("failed to resize local terminal: {error}"))
    }

    fn write(&self, data: &str) -> Result<(), String> {
        if self.closed.load(Ordering::Acquire) {
            return Err("local terminal session is closed".to_owned());
        }
        let mut writer = self
            .writer
            .lock()
            .map_err(|_| "local terminal session is unavailable".to_owned())?;
        writer
            .write_all(data.as_bytes())
            .map_err(|error| format!("failed to send local terminal input: {error}"))?;
        writer
            .flush()
            .map_err(|error| format!("failed to flush local terminal input: {error}"))
    }

    fn close(&self) {
        if self.closed.swap(true, Ordering::AcqRel) {
            return;
        }
        if let Ok(mut killer) = self.killer.lock() {
            let _ = killer.kill();
        }
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalTerminalStartRequest {
    pub columns: u16,
    pub rows: u16,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalTerminalInputRequest {
    pub session_id: String,
    pub data: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalTerminalResizeRequest {
    pub session_id: String,
    pub columns: u16,
    pub rows: u16,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalTerminalCloseRequest {
    pub session_id: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalTerminalStarted {
    pub session_id: String,
    pub shell: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct LocalTerminalEvent {
    session_id: String,
    kind: LocalTerminalEventKind,
    #[serde(skip_serializing_if = "Option::is_none")]
    data: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    exit_code: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    message: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "lowercase")]
enum LocalTerminalEventKind {
    Output,
    Exit,
    Error,
}

#[tauri::command]
pub fn desktop_local_terminal_start(
    app: AppHandle,
    registry: State<'_, LocalTerminalRegistry>,
    request: LocalTerminalStartRequest,
) -> Result<LocalTerminalStarted, String> {
    let size = terminal_size(request.columns, request.rows)?;
    let shell = default_shell();
    let (session, reader, child) = open_local_terminal_session(size, &shell)?;
    let session_id = Uuid::new_v4().to_string();
    registry.insert(session_id.clone(), Arc::clone(&session))?;

    spawn_terminal_reader(app.clone(), session_id.clone(), Arc::clone(&session), reader);
    spawn_terminal_waiter(app, session_id.clone(), session, child, registry.inner().clone());

    Ok(LocalTerminalStarted { session_id, shell })
}

#[tauri::command]
pub fn desktop_local_terminal_input(
    registry: State<'_, LocalTerminalRegistry>,
    request: LocalTerminalInputRequest,
) -> Result<(), String> {
    if request.data.is_empty() {
        return Ok(());
    }
    if request.data.len() > MAX_TERMINAL_INPUT_BYTES {
        return Err("local terminal input exceeds the size limit".to_owned());
    }
    registry.get(&request.session_id)?.write(&request.data)
}

#[tauri::command]
pub fn desktop_local_terminal_resize(
    registry: State<'_, LocalTerminalRegistry>,
    request: LocalTerminalResizeRequest,
) -> Result<(), String> {
    registry
        .get(&request.session_id)?
        .resize(terminal_size(request.columns, request.rows)?)
}

#[tauri::command]
pub fn desktop_local_terminal_close(
    registry: State<'_, LocalTerminalRegistry>,
    request: LocalTerminalCloseRequest,
) -> Result<(), String> {
    validate_session_id(&request.session_id)?;
    let Some(session) = registry.remove(&request.session_id)? else {
        return Err("local terminal session is unknown or closed".to_owned());
    };
    session.close();
    Ok(())
}

fn spawn_terminal_reader(
    app: AppHandle,
    session_id: String,
    session: Arc<LocalTerminalSession>,
    mut reader: Box<dyn Read + Send>,
) {
    thread::spawn(move || {
        let mut buffer = [0_u8; 4096];
        loop {
            match reader.read(&mut buffer) {
                Ok(0) => return,
                Ok(length) => emit_terminal_event(
                    &app,
                    LocalTerminalEvent {
                        session_id: session_id.clone(),
                        kind: LocalTerminalEventKind::Output,
                        data: Some(String::from_utf8_lossy(&buffer[..length]).into_owned()),
                        exit_code: None,
                        message: None,
                    },
                ),
                Err(error) if !session.closed.load(Ordering::Acquire) => {
                    emit_terminal_event(
                        &app,
                        LocalTerminalEvent {
                            session_id: session_id.clone(),
                            kind: LocalTerminalEventKind::Error,
                            data: None,
                            exit_code: None,
                            message: Some(format!("local terminal output stopped: {error}")),
                        },
                    );
                    return;
                }
                Err(_) => return,
            }
        }
    });
}

fn spawn_terminal_waiter(
    app: AppHandle,
    session_id: String,
    session: Arc<LocalTerminalSession>,
    mut child: Box<dyn Child + Send + Sync>,
    registry: LocalTerminalRegistry,
) {
    thread::spawn(move || {
        let result = child.wait();
        session.closed.store(true, Ordering::Release);
        let _ = registry.remove(&session_id);
        match result {
            Ok(status) => emit_terminal_event(
                &app,
                LocalTerminalEvent {
                    session_id,
                    kind: LocalTerminalEventKind::Exit,
                    data: None,
                    exit_code: Some(status.exit_code()),
                    message: status.signal().map(str::to_owned),
                },
            ),
            Err(error) => emit_terminal_event(
                &app,
                LocalTerminalEvent {
                    session_id,
                    kind: LocalTerminalEventKind::Error,
                    data: None,
                    exit_code: None,
                    message: Some(format!("local terminal wait failed: {error}")),
                },
            ),
        }
    });
}

fn emit_terminal_event(app: &AppHandle, event: LocalTerminalEvent) {
    let _ = app.emit_to("main", LOCAL_TERMINAL_EVENT, event);
}

fn open_local_terminal_session(
    size: PtySize,
    shell: &str,
) -> Result<(
    Arc<LocalTerminalSession>,
    Box<dyn Read + Send>,
    Box<dyn Child + Send + Sync>,
), String> {
    let pty_system = NativePtySystem::default();
    let pair = pty_system
        .openpty(size)
        .map_err(|error| format!("failed to create local terminal: {error}"))?;
    let mut command = CommandBuilder::new(shell);
    command.env("TERM", "xterm-256color");
    if let Some(home) = local_home_directory() {
        command.cwd(home);
    }
    let child = pair
        .slave
        .spawn_command(command)
        .map_err(|error| format!("failed to start local shell: {error}"))?;
    drop(pair.slave);
    let reader = pair
        .master
        .try_clone_reader()
        .map_err(|error| format!("failed to read local terminal: {error}"))?;
    let writer = pair
        .master
        .take_writer()
        .map_err(|error| format!("failed to write local terminal: {error}"))?;
    let session = Arc::new(LocalTerminalSession {
        master: Mutex::new(pair.master),
        writer: Mutex::new(writer),
        killer: Mutex::new(child.clone_killer()),
        closed: AtomicBool::new(false),
    });
    Ok((session, reader, child))
}

fn terminal_size(columns: u16, rows: u16) -> Result<PtySize, String> {
    if !(MIN_TERMINAL_COLUMNS..=MAX_TERMINAL_COLUMNS).contains(&columns) {
        return Err(format!(
            "local terminal columns must be between {MIN_TERMINAL_COLUMNS} and {MAX_TERMINAL_COLUMNS}"
        ));
    }
    if !(MIN_TERMINAL_ROWS..=MAX_TERMINAL_ROWS).contains(&rows) {
        return Err(format!(
            "local terminal rows must be between {MIN_TERMINAL_ROWS} and {MAX_TERMINAL_ROWS}"
        ));
    }
    Ok(PtySize {
        cols: columns,
        rows,
        pixel_width: 0,
        pixel_height: 0,
    })
}

fn validate_session_id(session_id: &str) -> Result<(), String> {
    Uuid::parse_str(session_id)
        .map(|_| ())
        .map_err(|_| "invalid local terminal session ID".to_owned())
}

fn local_home_directory() -> Option<String> {
    #[cfg(windows)]
    let value = std::env::var("USERPROFILE").ok();
    #[cfg(not(windows))]
    let value = std::env::var("HOME").ok();
    value.filter(|candidate| Path::new(candidate).is_absolute())
}

fn default_shell() -> String {
    #[cfg(windows)]
    {
        return std::env::var("COMSPEC")
            .ok()
            .filter(|candidate| Path::new(candidate).is_absolute())
            .unwrap_or_else(|| "cmd.exe".to_owned());
    }
    #[cfg(not(windows))]
    {
        std::env::var("SHELL")
            .ok()
            .filter(|candidate| Path::new(candidate).is_absolute())
            .unwrap_or_else(|| "/bin/sh".to_owned())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn terminal_size_rejects_unbounded_webview_dimensions() {
        assert!(terminal_size(80, 24).is_ok());
        assert!(terminal_size(19, 24).is_err());
        assert!(terminal_size(80, 301).is_err());
    }

    #[test]
    fn opaque_session_ids_must_be_uuids() {
        assert!(validate_session_id("local-term-1").is_err());
        assert!(validate_session_id(&Uuid::new_v4().to_string()).is_ok());
    }

    #[test]
    fn local_terminal_starts_in_an_absolute_local_home_when_available() {
        assert!(local_home_directory().is_none_or(|value| Path::new(&value).is_absolute()));
        assert!(Path::new(&default_shell()).is_absolute() || cfg!(windows));
    }

    #[cfg(unix)]
    #[test]
    fn native_pty_starts_and_is_terminated_without_a_server() {
        let (session, _reader, mut child) = open_local_terminal_session(
            terminal_size(80, 24).expect("bounded terminal dimensions"),
            &default_shell(),
        )
        .expect("the local shell must start through the native PTY");
        session.close();
        assert!(child.wait().is_ok());
    }
}

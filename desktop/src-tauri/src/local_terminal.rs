use std::{
    collections::HashMap,
    ffi::OsString,
    io::{Read, Write},
    path::Path,
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Condvar, Mutex,
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
const LOCAL_TERMINAL_OUTPUT_WINDOW_BYTES: usize = 128 * 1024;
const LOCAL_TERMINAL_OUTPUT_FRAME_BYTES: usize = 32 * 1024;
const LOCAL_TERMINAL_READ_BUFFER_BYTES: usize = 4 * 1024;
const MAIN_WINDOW_LABEL: &str = "main";

#[cfg(windows)]
const TERMINAL_ENV_ALLOWLIST: &[&str] = &[
    "COMSPEC",
    "HOMEDRIVE",
    "HOMEPATH",
    "PATH",
    "PATHEXT",
    "SYSTEMROOT",
    "TEMP",
    "TMP",
    "USERNAME",
    "USERPROFILE",
    "WINDIR",
];

#[cfg(not(windows))]
const TERMINAL_ENV_ALLOWLIST: &[&str] = &["HOME", "PATH", "SHELL", "USER"];

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
    owner_window_label: String,
    master: Mutex<Box<dyn MasterPty + Send>>,
    writer: Mutex<Box<dyn Write + Send>>,
    killer: Mutex<Box<dyn ChildKiller + Send + Sync>>,
    closed: AtomicBool,
    output_credit: Mutex<OutputCredit>,
    output_credit_available: Condvar,
}

struct OutputCredit {
    available_bytes: usize,
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

    fn get_for_owner(
        &self,
        session_id: &str,
        owner_window_label: &str,
    ) -> Result<Arc<LocalTerminalSession>, String> {
        validate_session_id(session_id)?;
        let sessions = self
            .inner
            .sessions
            .lock()
            .map_err(|_| "local terminal registry is unavailable".to_owned())?;
        let session = sessions
            .get(session_id)
            .cloned()
            .ok_or_else(|| "local terminal session is unknown or closed".to_owned())?;
        session.assert_owner(owner_window_label)?;
        Ok(session)
    }

    fn remove_for_owner(
        &self,
        session_id: &str,
        owner_window_label: &str,
    ) -> Result<Option<Arc<LocalTerminalSession>>, String> {
        validate_session_id(session_id)?;
        let mut sessions = self
            .inner
            .sessions
            .lock()
            .map_err(|_| "local terminal registry is unavailable".to_owned())?;
        if let Some(session) = sessions.get(session_id) {
            session.assert_owner(owner_window_label)?;
        }
        Ok(sessions.remove(session_id))
    }

    fn remove_finished(&self, session_id: &str) {
        if let Ok(mut sessions) = self.inner.sessions.lock() {
            sessions.remove(session_id);
        }
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
    fn assert_owner(&self, owner_window_label: &str) -> Result<(), String> {
        if self.owner_window_label == owner_window_label {
            Ok(())
        } else {
            Err("local terminal session is not owned by this window".to_owned())
        }
    }

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
        self.output_credit_available.notify_all();
        if let Ok(mut killer) = self.killer.lock() {
            let _ = killer.kill();
        }
    }

    fn mark_finished(&self) {
        self.closed.store(true, Ordering::Release);
        self.output_credit_available.notify_all();
    }

    fn reserve_output_bytes(&self, maximum_bytes: usize) -> Option<usize> {
        let mut credit = self.output_credit.lock().ok()?;
        loop {
            if self.closed.load(Ordering::Acquire) {
                return None;
            }
            if credit.available_bytes > 0 {
                let reserved_bytes = credit.available_bytes.min(maximum_bytes);
                credit.available_bytes -= reserved_bytes;
                return Some(reserved_bytes);
            }
            credit = self.output_credit_available.wait(credit).ok()?;
        }
    }

    fn restore_output_bytes(&self, bytes: usize) {
        if bytes == 0 {
            return;
        }
        if let Ok(mut credit) = self.output_credit.lock() {
            credit.available_bytes = credit
                .available_bytes
                .saturating_add(bytes)
                .min(LOCAL_TERMINAL_OUTPUT_WINDOW_BYTES);
            self.output_credit_available.notify_one();
        }
    }

    /// Exit is not emitted until every renderer-admitted output byte has been
    /// acknowledged. This keeps the native output window and the webview's
    /// terminal paint order aligned at the final process boundary.
    fn wait_for_output_drain(&self) {
        let Ok(mut credit) = self.output_credit.lock() else {
            return;
        };
        while !self.closed.load(Ordering::Acquire)
            && credit.available_bytes < LOCAL_TERMINAL_OUTPUT_WINDOW_BYTES
        {
            let Ok(next) = self.output_credit_available.wait(credit) else {
                return;
            };
            credit = next;
        }
    }

    fn acknowledge_output(&self, bytes: usize) -> Result<(), String> {
        if !(1..=LOCAL_TERMINAL_OUTPUT_WINDOW_BYTES).contains(&bytes) {
            return Err("local terminal output acknowledgement is outside the configured window".to_owned());
        }
        if self.closed.load(Ordering::Acquire) {
            return Err("local terminal session is closed".to_owned());
        }
        self.restore_output_bytes(bytes);
        Ok(())
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

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalTerminalOutputAckRequest {
    pub session_id: String,
    pub byte_length: usize,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalTerminalStarted {
    pub session_id: String,
    pub shell: String,
    pub output_window_bytes: usize,
    pub output_frame_bytes: usize,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct LocalTerminalEvent {
    session_id: String,
    kind: LocalTerminalEventKind,
    #[serde(skip_serializing_if = "Option::is_none")]
    data: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    byte_length: Option<usize>,
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
    window: tauri::WebviewWindow,
    registry: State<'_, LocalTerminalRegistry>,
    request: LocalTerminalStartRequest,
) -> Result<LocalTerminalStarted, String> {
    let owner_window_label = require_terminal_window(&window)?;
    let size = terminal_size(request.columns, request.rows)?;
    let shell = default_shell();
    let (session, reader, child) = open_local_terminal_session(size, &shell, owner_window_label.clone())?;
    let session_id = Uuid::new_v4().to_string();
    registry.insert(session_id.clone(), Arc::clone(&session))?;

    let reader = spawn_terminal_reader(app.clone(), session_id.clone(), Arc::clone(&session), reader);
    spawn_terminal_waiter(app, session_id.clone(), session, child, registry.inner().clone(), reader);

    Ok(LocalTerminalStarted {
        session_id,
        shell,
        output_window_bytes: LOCAL_TERMINAL_OUTPUT_WINDOW_BYTES,
        output_frame_bytes: LOCAL_TERMINAL_OUTPUT_FRAME_BYTES,
    })
}

#[tauri::command]
pub fn desktop_local_terminal_input(
    window: tauri::WebviewWindow,
    registry: State<'_, LocalTerminalRegistry>,
    request: LocalTerminalInputRequest,
) -> Result<(), String> {
    let owner_window_label = require_terminal_window(&window)?;
    if request.data.is_empty() {
        return Ok(());
    }
    if request.data.len() > MAX_TERMINAL_INPUT_BYTES {
        return Err("local terminal input exceeds the size limit".to_owned());
    }
    registry
        .get_for_owner(&request.session_id, &owner_window_label)?
        .write(&request.data)
}

#[tauri::command]
pub fn desktop_local_terminal_resize(
    window: tauri::WebviewWindow,
    registry: State<'_, LocalTerminalRegistry>,
    request: LocalTerminalResizeRequest,
) -> Result<(), String> {
    let owner_window_label = require_terminal_window(&window)?;
    registry
        .get_for_owner(&request.session_id, &owner_window_label)?
        .resize(terminal_size(request.columns, request.rows)?)
}

#[tauri::command]
pub fn desktop_local_terminal_close(
    window: tauri::WebviewWindow,
    registry: State<'_, LocalTerminalRegistry>,
    request: LocalTerminalCloseRequest,
) -> Result<(), String> {
    let owner_window_label = require_terminal_window(&window)?;
    let Some(session) = registry.remove_for_owner(&request.session_id, &owner_window_label)? else {
        return Err("local terminal session is unknown or closed".to_owned());
    };
    session.close();
    Ok(())
}

#[tauri::command]
pub fn desktop_local_terminal_ack_output(
    window: tauri::WebviewWindow,
    registry: State<'_, LocalTerminalRegistry>,
    request: LocalTerminalOutputAckRequest,
) -> Result<(), String> {
    let owner_window_label = require_terminal_window(&window)?;
    registry
        .get_for_owner(&request.session_id, &owner_window_label)?
        .acknowledge_output(request.byte_length)
}

fn spawn_terminal_reader(
    app: AppHandle,
    session_id: String,
    session: Arc<LocalTerminalSession>,
    mut reader: Box<dyn Read + Send>,
) -> thread::JoinHandle<()> {
    thread::spawn(move || {
        let mut buffer = [0_u8; LOCAL_TERMINAL_READ_BUFFER_BYTES];
        loop {
            let Some(read_limit) = session.reserve_output_bytes(buffer.len()) else {
                return;
            };
            match reader.read(&mut buffer[..read_limit]) {
                Ok(0) => {
                    session.restore_output_bytes(read_limit);
                    session.wait_for_output_drain();
                    return;
                }
                Ok(length) => {
                    session.restore_output_bytes(read_limit.saturating_sub(length));
                    emit_terminal_event(
                        &app,
                        &session.owner_window_label,
                        LocalTerminalEvent {
                            session_id: session_id.clone(),
                            kind: LocalTerminalEventKind::Output,
                            data: Some(String::from_utf8_lossy(&buffer[..length]).into_owned()),
                            byte_length: Some(length),
                            exit_code: None,
                            message: None,
                        },
                    )
                }
                Err(error) if !session.closed.load(Ordering::Acquire) => {
                    session.restore_output_bytes(read_limit);
                    emit_terminal_event(
                        &app,
                        &session.owner_window_label,
                        LocalTerminalEvent {
                            session_id: session_id.clone(),
                            kind: LocalTerminalEventKind::Error,
                            data: None,
                            byte_length: None,
                            exit_code: None,
                            message: Some(format!("local terminal output stopped: {error}")),
                        },
                    );
                    return;
                }
                Err(_) => {
                    session.restore_output_bytes(read_limit);
                    return;
                }
            }
        }
    })
}

fn spawn_terminal_waiter(
    app: AppHandle,
    session_id: String,
    session: Arc<LocalTerminalSession>,
    mut child: Box<dyn Child + Send + Sync>,
    registry: LocalTerminalRegistry,
    reader: thread::JoinHandle<()>,
) {
    thread::spawn(move || {
        let result = child.wait();
        let _ = reader.join();
        session.mark_finished();
        registry.remove_finished(&session_id);
        match result {
            Ok(status) => emit_terminal_event(
                &app,
                &session.owner_window_label,
                LocalTerminalEvent {
                    session_id,
                    kind: LocalTerminalEventKind::Exit,
                    data: None,
                    byte_length: None,
                    exit_code: Some(status.exit_code()),
                    message: status.signal().map(str::to_owned),
                },
            ),
            Err(error) => emit_terminal_event(
                &app,
                &session.owner_window_label,
                LocalTerminalEvent {
                    session_id,
                    kind: LocalTerminalEventKind::Error,
                    data: None,
                    byte_length: None,
                    exit_code: None,
                    message: Some(format!("local terminal wait failed: {error}")),
                },
            ),
        }
    });
}

fn emit_terminal_event(app: &AppHandle, owner_window_label: &str, event: LocalTerminalEvent) {
    let _ = app.emit_to(owner_window_label, LOCAL_TERMINAL_EVENT, event);
}

fn open_local_terminal_session(
    size: PtySize,
    shell: &str,
    owner_window_label: String,
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
    configure_local_terminal_environment(&mut command);
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
        owner_window_label,
        master: Mutex::new(pair.master),
        writer: Mutex::new(writer),
        killer: Mutex::new(child.clone_killer()),
        closed: AtomicBool::new(false),
        output_credit: Mutex::new(OutputCredit {
            available_bytes: LOCAL_TERMINAL_OUTPUT_WINDOW_BYTES,
        }),
        output_credit_available: Condvar::new(),
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

fn require_terminal_window(window: &tauri::WebviewWindow) -> Result<String, String> {
    let window_label = window.label();
    validate_terminal_window_label(window_label)?;
    Ok(window_label.to_owned())
}

fn validate_terminal_window_label(window_label: &str) -> Result<(), String> {
    if window_label == MAIN_WINDOW_LABEL {
        Ok(())
    } else {
        Err("local terminal commands are restricted to the main window".to_owned())
    }
}

fn configure_local_terminal_environment(command: &mut CommandBuilder) {
    apply_terminal_environment(command, terminal_environment());
}

fn apply_terminal_environment(command: &mut CommandBuilder, environment: Vec<(OsString, OsString)>) {
    command.env_clear();
    for (key, value) in environment {
        command.env(key, value);
    }
}

fn terminal_environment() -> Vec<(OsString, OsString)> {
    terminal_environment_from(|key| std::env::var_os(key))
}

fn terminal_environment_from(
    mut get_environment_value: impl FnMut(&str) -> Option<OsString>,
) -> Vec<(OsString, OsString)> {
    let mut environment = TERMINAL_ENV_ALLOWLIST
        .iter()
        .filter_map(|key| {
            get_environment_value(key).map(|value| (OsString::from(*key), value))
        })
        .collect::<Vec<_>>();
    environment.push((OsString::from("TERM"), OsString::from("xterm-256color")));
    environment
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
    use std::collections::HashMap;

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

    #[test]
    fn non_main_windows_cannot_use_the_local_terminal_boundary() {
        assert!(validate_terminal_window_label(MAIN_WINDOW_LABEL).is_ok());
        assert!(validate_terminal_window_label("settings").is_err());
    }

    #[test]
    fn terminal_child_environment_is_allowlisted_and_excludes_app_credentials() {
        let source = HashMap::from([
            ("HOME", OsString::from("/Users/local-user")),
            ("PATH", OsString::from("/usr/local/bin:/usr/bin:/bin")),
            ("SHELL", OsString::from("/bin/zsh")),
            ("USER", OsString::from("local-user")),
            ("OPSIA_SERVER_TOKEN", OsString::from("must-not-reach-the-shell")),
            ("AWS_SECRET_ACCESS_KEY", OsString::from("must-not-reach-the-shell")),
        ]);
        let environment = terminal_environment_from(|key| source.get(key).cloned());
        let mut command = CommandBuilder::new(default_shell());
        command.env("OPSIA_SERVER_TOKEN", "must-be-cleared");
        command.env("AWS_SECRET_ACCESS_KEY", "must-be-cleared");
        apply_terminal_environment(&mut command, environment);

        assert_eq!(
            command.get_env("TERM"),
            Some(std::ffi::OsStr::new("xterm-256color"))
        );
        assert!(command.get_env("OPSIA_SERVER_TOKEN").is_none());
        assert!(command.get_env("AWS_SECRET_ACCESS_KEY").is_none());
    }

    #[cfg(unix)]
    #[test]
    fn cross_owner_input_and_close_are_denied_without_removing_the_session() {
        let registry = LocalTerminalRegistry::default();
        let session_id = Uuid::new_v4().to_string();
        let (session, _reader, mut child) = open_local_terminal_session(
            terminal_size(80, 24).expect("bounded terminal dimensions"),
            &default_shell(),
            MAIN_WINDOW_LABEL.to_owned(),
        )
        .expect("the local shell must start through the native PTY");
        registry
            .insert(session_id.clone(), Arc::clone(&session))
            .expect("session must be registered");

        assert!(registry.get_for_owner(&session_id, "other-window").is_err());
        assert!(registry.remove_for_owner(&session_id, "other-window").is_err());
        assert!(registry.get_for_owner(&session_id, MAIN_WINDOW_LABEL).is_ok());

        let owner_session = registry
            .remove_for_owner(&session_id, MAIN_WINDOW_LABEL)
            .expect("owner close must be evaluated")
            .expect("owner close must retain the session until it is authorized");
        owner_session.close();
        assert!(child.wait().is_ok());
    }

    #[cfg(unix)]
    #[test]
    fn output_credit_is_bounded_and_close_unblocks_the_reader() {
        let (session, _reader, mut child) = open_local_terminal_session(
            terminal_size(80, 24).expect("bounded terminal dimensions"),
            &default_shell(),
            MAIN_WINDOW_LABEL.to_owned(),
        )
        .expect("the local shell must start through the native PTY");

        assert_eq!(
            session.reserve_output_bytes(LOCAL_TERMINAL_OUTPUT_WINDOW_BYTES * 2),
            Some(LOCAL_TERMINAL_OUTPUT_WINDOW_BYTES)
        );
        assert!(session
            .acknowledge_output(LOCAL_TERMINAL_OUTPUT_WINDOW_BYTES + 1)
            .is_err());
        session.close();
        assert_eq!(session.reserve_output_bytes(1), None);
        assert!(child.wait().is_ok());
    }

    #[cfg(unix)]
    #[test]
    fn native_pty_starts_and_is_terminated_without_a_server() {
        let (session, _reader, mut child) = open_local_terminal_session(
            terminal_size(80, 24).expect("bounded terminal dimensions"),
            &default_shell(),
            MAIN_WINDOW_LABEL.to_owned(),
        )
        .expect("the local shell must start through the native PTY");
        session.close();
        assert!(child.wait().is_ok());
    }
}

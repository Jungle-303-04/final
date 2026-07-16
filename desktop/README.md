# Opsia desktop foundation

This package wraps the existing `frontend` Vite build in a local Tauri shell.
It is deliberately separate from the Python services: native files, the
default browser and the local terminal are owned only by this process.

The initial bridge provides the window title, native menu events, system-theme
lookup, an HTTP(S)-only external opener and user-dialog-selected file save/open
actions. A saved file is represented in the webview by an opaque handle rather
than a workstation path.

`localTerminal` is a native PTY capability. It starts only the local user's
shell, streams through typed Tauri events, accepts bounded input and resize
requests, and is terminated when its sheet or desktop process closes. It does
not proxy through Python or receive server-held credentials.

The terminal boundary is defense in depth: the packaged renderer has no broad
global Tauri API, CSP and navigation restrict it to the bundled app (or the
exact local development origin), new webviews are denied, capabilities are
scoped to the main webview, and native sessions verify their owning window.
The child shell receives only the minimal allowlisted local environment needed
for terminal usability. These controls reduce the blast radius of renderer
failures; they do not claim that a compromised trusted main renderer is a
separate security principal.

`updater` remains unsupported until signed release metadata and platform
signing keys are configured. It has no Python fallback.

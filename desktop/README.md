# Opsia desktop foundation

This package wraps the existing `frontend` Vite build in a local Tauri shell.
It is deliberately separate from the Python services: native files, the
default browser and any future local terminal are owned only by this process.

The initial bridge provides the window title, native menu events, system-theme
lookup, an HTTP(S)-only external opener and user-dialog-selected file save/open
actions. A saved file is represented in the webview by an opaque handle rather
than a workstation path.

`localTerminal` and `updater` are explicitly unsupported in this foundation.
They have no Tauri command, no capability permission and no Python fallback.

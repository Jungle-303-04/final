import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

export const DESKTOP_COMMAND = {
  capabilities: "desktop_capabilities",
  setActiveClusterTitle: "desktop_set_active_cluster_title",
  openExternalUrl: "desktop_open_external_url",
  saveFile: "desktop_save_file",
  openSavedFile: "desktop_open_saved_file",
  revealSavedFile: "desktop_reveal_saved_file",
  systemTheme: "desktop_system_theme",
  localTerminalStart: "desktop_local_terminal_start",
  localTerminalInput: "desktop_local_terminal_input",
  localTerminalResize: "desktop_local_terminal_resize",
  localTerminalClose: "desktop_local_terminal_close",
  localTerminalAckOutput: "desktop_local_terminal_ack_output",
  portForwardSessions: "desktop_port_forward_sessions",
  portForwardStop: "desktop_port_forward_stop",
} as const;

export type DesktopPlatform = "macos" | "windows" | "linux" | "browser";
export type DesktopCapabilityState = "available" | "unsupported";
export type DesktopTheme = "light" | "dark" | "unknown";
export type DesktopMenuAction = "settings" | "reload";
export const DESKTOP_LOCAL_TERMINAL_EVENT = "desktop:local-terminal";

export interface DesktopCapability {
  state: DesktopCapabilityState;
  reason?: string;
}

export interface DesktopCapabilitySet {
  platform: DesktopPlatform;
  activeClusterTitle: DesktopCapability;
  nativeMenu: DesktopCapability;
  systemTheme: DesktopCapability;
  externalUrl: DesktopCapability;
  safeFile: DesktopCapability;
  localTerminal: DesktopCapability;
  portForwardSessions: DesktopCapability;
  updater: DesktopCapability;
}

export interface ActiveClusterTitleRequest {
  clusterId: string | null;
  displayName: string | null;
}

export interface SaveDesktopFileRequest {
  filename: string;
  content?: string;
  contentBase64?: string;
}

export interface DesktopSavedFile {
  handleId: string;
  filename: string;
}

export type SaveDesktopFileResult =
  | { kind: "saved"; file: DesktopSavedFile }
  | { kind: "cancelled" };

export interface StartLocalTerminalRequest {
  columns: number;
  rows: number;
}

export interface DesktopLocalTerminalSession {
  sessionId: string;
  shell: string;
  outputWindowBytes: number;
  outputFrameBytes: number;
}

export interface LocalTerminalInputRequest {
  sessionId: string;
  data: string;
}

export interface LocalTerminalResizeRequest {
  sessionId: string;
  columns: number;
  rows: number;
}

export interface LocalTerminalOutputAckRequest {
  sessionId: string;
  byteLength: number;
}

export type DesktopLocalTerminalEvent =
  | { sessionId: string; kind: "output"; data: string; byteLength: number }
  | { sessionId: string; kind: "exit"; exitCode: number; message?: string }
  | { sessionId: string; kind: "error"; message: string };

export interface DesktopPortForwardSession {
  id: string;
  clusterId: string;
  namespace: string;
  podName: string;
  podPort: number;
  localPort: number;
  listenAddress: "127.0.0.1" | "0.0.0.0";
  serviceName: string | null;
  servicePort: number | null;
  scheme: "http" | "https" | null;
  startedAt: string;
  status: "running" | "stopped" | "error";
  error: string | null;
}

interface DesktopRuntime {
  core: {
    invoke<T>(command: string, args?: Record<string, unknown>): Promise<T>;
  };
  event?: {
    listen<T>(event: string, listener: (payload: { payload: T }) => void): Promise<() => void>;
  };
}

export interface DesktopBridge {
  isDesktop: boolean;
  capabilities: () => Promise<DesktopCapabilitySet>;
  setActiveClusterTitle: (request: ActiveClusterTitleRequest) => Promise<void>;
  openExternalUrl: (url: string) => Promise<void>;
  saveFile: (request: SaveDesktopFileRequest) => Promise<SaveDesktopFileResult>;
  openSavedFile: (handleId: string) => Promise<void>;
  revealSavedFile: (handleId: string) => Promise<void>;
  systemTheme: () => Promise<DesktopTheme>;
  startLocalTerminal: (request: StartLocalTerminalRequest) => Promise<DesktopLocalTerminalSession>;
  sendLocalTerminalInput: (request: LocalTerminalInputRequest) => Promise<void>;
  resizeLocalTerminal: (request: LocalTerminalResizeRequest) => Promise<void>;
  closeLocalTerminal: (sessionId: string) => Promise<void>;
  acknowledgeLocalTerminalOutput: (request: LocalTerminalOutputAckRequest) => Promise<void>;
  listPortForwardSessions: () => Promise<readonly DesktopPortForwardSession[]>;
  stopPortForwardSession: (sessionId: string) => Promise<void>;
  /**
   * Resolves only after the native event listener is installed.  A terminal
   * must wait for this before starting its PTY so the initial shell prompt is
   * never lost between process creation and subscription.
   */
  onLocalTerminalEvent: (listener: (event: DesktopLocalTerminalEvent) => void) => Promise<() => void>;
  onMenuAction: (listener: (action: DesktopMenuAction) => void) => () => void;
}

const DESKTOP_MENU_EVENT = "desktop:menu";

const BROWSER_CAPABILITIES: DesktopCapabilitySet = {
  platform: "browser",
  activeClusterTitle: unsupported("The browser has no native title bar."),
  nativeMenu: unsupported("The browser has no native application menu."),
  systemTheme: unsupported("The browser theme follows its own media query."),
  externalUrl: { state: "available" },
  safeFile: unsupported("Native save handles are available only in the desktop shell."),
  localTerminal: unsupported("Local PTY is available only in the native desktop shell."),
  portForwardSessions: unsupported(
    "Port-forward sessions are owned only by the native desktop shell.",
  ),
  updater: unsupported("Application updates are available only in a signed desktop release."),
};

export function createDesktopBridge(runtime: DesktopRuntime | undefined = createNativeDesktopRuntime()): DesktopBridge {
  if (!runtime) return browserDesktopBridge();

  return {
    isDesktop: true,
    capabilities: () => runtime.core.invoke<DesktopCapabilitySet>(DESKTOP_COMMAND.capabilities),
    setActiveClusterTitle: (request) => runtime.core.invoke<void>(
      DESKTOP_COMMAND.setActiveClusterTitle,
      { request },
    ),
    openExternalUrl: async (url) => {
      assertExternalHttpUrl(url);
      await runtime.core.invoke<void>(DESKTOP_COMMAND.openExternalUrl, { request: { url } });
    },
    saveFile: (request) => runtime.core.invoke<SaveDesktopFileResult>(
      DESKTOP_COMMAND.saveFile,
      { request },
    ),
    openSavedFile: (handleId) => runtime.core.invoke<void>(
      DESKTOP_COMMAND.openSavedFile,
      { request: { handleId } },
    ),
    revealSavedFile: (handleId) => runtime.core.invoke<void>(
      DESKTOP_COMMAND.revealSavedFile,
      { request: { handleId } },
    ),
    systemTheme: () => runtime.core.invoke<DesktopTheme>(DESKTOP_COMMAND.systemTheme),
    startLocalTerminal: (request) => runtime.core.invoke<DesktopLocalTerminalSession>(
      DESKTOP_COMMAND.localTerminalStart,
      { request },
    ),
    sendLocalTerminalInput: (request) => runtime.core.invoke<void>(
      DESKTOP_COMMAND.localTerminalInput,
      { request },
    ),
    resizeLocalTerminal: (request) => runtime.core.invoke<void>(
      DESKTOP_COMMAND.localTerminalResize,
      { request },
    ),
    closeLocalTerminal: (sessionId) => runtime.core.invoke<void>(
      DESKTOP_COMMAND.localTerminalClose,
      { request: { sessionId } },
    ),
    acknowledgeLocalTerminalOutput: (request) => runtime.core.invoke<void>(
      DESKTOP_COMMAND.localTerminalAckOutput,
      { request },
    ),
    listPortForwardSessions: () => runtime.core.invoke<readonly DesktopPortForwardSession[]>(
      DESKTOP_COMMAND.portForwardSessions,
    ),
    stopPortForwardSession: (sessionId) => runtime.core.invoke<void>(
      DESKTOP_COMMAND.portForwardStop,
      { request: { sessionId } },
    ),
    onLocalTerminalEvent: (listener) => subscribeLocalTerminal(runtime, listener),
    onMenuAction: (listener) => subscribeDesktopMenu(runtime, listener),
  };
}

export const desktopBridge = createDesktopBridge();

function browserDesktopBridge(): DesktopBridge {
  return {
    isDesktop: false,
    capabilities: async () => BROWSER_CAPABILITIES,
    setActiveClusterTitle: async () => undefined,
    openExternalUrl: async (url) => {
      assertExternalHttpUrl(url);
      window.open(url, "_blank", "noopener,noreferrer");
    },
    saveFile: async () => {
      throw new Error(BROWSER_CAPABILITIES.safeFile.reason);
    },
    openSavedFile: async () => {
      throw new Error(BROWSER_CAPABILITIES.safeFile.reason);
    },
    revealSavedFile: async () => {
      throw new Error(BROWSER_CAPABILITIES.safeFile.reason);
    },
    systemTheme: async () => "unknown",
    startLocalTerminal: async () => {
      throw new Error(BROWSER_CAPABILITIES.localTerminal.reason);
    },
    sendLocalTerminalInput: async () => {
      throw new Error(BROWSER_CAPABILITIES.localTerminal.reason);
    },
    resizeLocalTerminal: async () => {
      throw new Error(BROWSER_CAPABILITIES.localTerminal.reason);
    },
    closeLocalTerminal: async () => {
      throw new Error(BROWSER_CAPABILITIES.localTerminal.reason);
    },
    acknowledgeLocalTerminalOutput: async () => {
      throw new Error(BROWSER_CAPABILITIES.localTerminal.reason);
    },
    listPortForwardSessions: async () => {
      throw new Error(BROWSER_CAPABILITIES.portForwardSessions.reason);
    },
    stopPortForwardSession: async () => {
      throw new Error(BROWSER_CAPABILITIES.portForwardSessions.reason);
    },
    onLocalTerminalEvent: async () => () => undefined,
    onMenuAction: () => () => undefined,
  };
}

function createNativeDesktopRuntime(): DesktopRuntime | undefined {
  if (typeof window === "undefined" || !isTauri()) return undefined;
  return {
    core: { invoke },
    event: { listen },
  };
}

function subscribeDesktopMenu(
  runtime: DesktopRuntime,
  listener: (action: DesktopMenuAction) => void,
): () => void {
  if (!runtime.event?.listen) return () => undefined;
  let disposed = false;
  const unlisten = runtime.event.listen<unknown>(DESKTOP_MENU_EVENT, ({ payload }) => {
    if (!disposed && (payload === "settings" || payload === "reload")) listener(payload);
  });
  return () => {
    disposed = true;
    void unlisten.then((removeListener) => removeListener());
  };
}

function subscribeLocalTerminal(
  runtime: DesktopRuntime,
  listener: (event: DesktopLocalTerminalEvent) => void,
): Promise<() => void> {
  if (!runtime.event?.listen) return Promise.resolve(() => undefined);
  let disposed = false;
  return runtime.event.listen<unknown>(DESKTOP_LOCAL_TERMINAL_EVENT, ({ payload }) => {
    const event = parseLocalTerminalEvent(payload);
    if (!disposed && event) listener(event);
  }).then((removeListener) => () => {
    disposed = true;
    removeListener();
  });
}

function parseLocalTerminalEvent(value: unknown): DesktopLocalTerminalEvent | null {
  if (!isRecord(value) || typeof value.sessionId !== "string" || !value.sessionId) return null;
  if (
    value.kind === "output"
    && typeof value.data === "string"
    && typeof value.byteLength === "number"
    && Number.isSafeInteger(value.byteLength)
    && value.byteLength > 0
  ) {
    return {
      sessionId: value.sessionId,
      kind: "output",
      data: value.data,
      byteLength: value.byteLength,
    };
  }
  if (value.kind === "exit" && typeof value.exitCode === "number") {
    return {
      sessionId: value.sessionId,
      kind: "exit",
      exitCode: value.exitCode,
      ...(typeof value.message === "string" ? { message: value.message } : {}),
    };
  }
  if (value.kind === "error" && typeof value.message === "string") {
    return { sessionId: value.sessionId, kind: "error", message: value.message };
  }
  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function assertExternalHttpUrl(value: string): void {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("External URL must be valid.");
  }
  if (
    (url.protocol !== "https:" && url.protocol !== "http:") ||
    !url.hostname ||
    url.username ||
    url.password
  ) {
    throw new Error("External URL must be an absolute HTTP(S) URL without credentials.");
  }
}

function unsupported(reason: string): DesktopCapability {
  return { state: "unsupported", reason };
}

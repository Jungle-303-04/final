export const DESKTOP_COMMAND = {
  capabilities: "desktop_capabilities",
  setActiveClusterTitle: "desktop_set_active_cluster_title",
  openExternalUrl: "desktop_open_external_url",
  saveFile: "desktop_save_file",
  openSavedFile: "desktop_open_saved_file",
  revealSavedFile: "desktop_reveal_saved_file",
  systemTheme: "desktop_system_theme",
} as const;

export type DesktopPlatform = "macos" | "windows" | "linux" | "browser";
export type DesktopCapabilityState = "available" | "unsupported";
export type DesktopTheme = "light" | "dark" | "unknown";
export type DesktopMenuAction = "settings" | "reload";

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
  localTerminal: unsupported("Local PTY is desktop-only and is not implemented."),
  updater: unsupported("Application updates are available only in a signed desktop release."),
};

export function createDesktopBridge(runtime: DesktopRuntime | undefined = readDesktopRuntime()): DesktopBridge {
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
    onMenuAction: () => () => undefined,
  };
}

function readDesktopRuntime(): DesktopRuntime | undefined {
  if (typeof window === "undefined") return undefined;
  const candidate = (window as Window & { __TAURI__?: DesktopRuntime }).__TAURI__;
  return candidate?.core?.invoke ? candidate : undefined;
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

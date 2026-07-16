export type UiThemePreference = "system" | "light" | "dark";
export type UiLocalePreference = "en" | "ko";

export interface NamespaceScopeRecord {
  clusterId: string;
  activeNamespaces: readonly string[];
  revision: number;
}

export interface UiPreferencesRecord {
  preferences: {
    theme: UiThemePreference;
    locale: UiLocalePreference;
  };
  revision: number;
}

export interface NamespaceScopeUpdate {
  clusterId: string;
  namespaces: readonly string[];
  expectedRevision: number;
}

export interface UiPreferencesUpdate {
  preferences: UiPreferencesRecord["preferences"];
  expectedRevision: number;
}

export type ShellStateFailureCode =
  | "conflict"
  | "unauthorized"
  | "forbidden"
  | "invalid-request"
  | "invalid-response"
  | "offline"
  | "rate-limited"
  | "error";

export class ShellStatePortFailure extends Error {
  readonly code: ShellStateFailureCode;

  constructor(code: ShellStateFailureCode) {
    super(`Shell state port failed: ${code}`);
    this.name = "ShellStatePortFailure";
    this.code = code;
  }
}

export interface ShellStatePort {
  getNamespaceScope(clusterId: string, signal?: AbortSignal): Promise<NamespaceScopeRecord>;
  updateNamespaceScope(
    input: NamespaceScopeUpdate,
    signal?: AbortSignal,
  ): Promise<NamespaceScopeRecord>;
  getUiPreferences(signal?: AbortSignal): Promise<UiPreferencesRecord>;
  updateUiPreferences(
    input: UiPreferencesUpdate,
    signal?: AbortSignal,
  ): Promise<UiPreferencesRecord>;
}

const unavailable = () => Promise.reject(new ShellStatePortFailure("error"));

export const EMPTY_SHELL_STATE_PORT: ShellStatePort = {
  getNamespaceScope: unavailable,
  updateNamespaceScope: unavailable,
  getUiPreferences: unavailable,
  updateUiPreferences: unavailable,
};

import {
  ShellStatePortFailure,
  type NamespaceScopeRecord,
  type ShellStateFailureCode,
  type ShellStatePort,
  type UiPreferencesRecord,
} from "./shellStateContract";
import type {
  NamespaceScopeEndpoint,
  ShellStateEndpointDependencies,
  UiPreferencesEndpoint,
} from "./shellStateEndpointContract";

export function createShellStateAdapter(
  endpoints: ShellStateEndpointDependencies,
): ShellStatePort {
  return {
    getNamespaceScope: (clusterId, signal) => withPortFailure(async () =>
      toNamespaceScope(await endpoints.getNamespaceScope(clusterId, signal))),
    updateNamespaceScope: (input, signal) => withPortFailure(async () =>
      toNamespaceScope(await endpoints.updateNamespaceScope(input, signal))),
    getUiPreferences: (signal) => withPortFailure(async () =>
      toUiPreferences(await endpoints.getUiPreferences(signal))),
    updateUiPreferences: (input, signal) => withPortFailure(async () =>
      toUiPreferences(await endpoints.updateUiPreferences(input, signal))),
  };
}

function toNamespaceScope(value: NamespaceScopeEndpoint): NamespaceScopeRecord {
  return {
    clusterId: value.cluster_id,
    activeNamespaces: [...value.actives],
    revision: value.revision,
  };
}

function toUiPreferences(value: UiPreferencesEndpoint): UiPreferencesRecord {
  return {
    preferences: { ...value.preferences },
    revision: value.revision,
  };
}

async function withPortFailure<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (isAbortError(error) || error instanceof ShellStatePortFailure) throw error;
    throw toPortFailure(error);
  }
}

function toPortFailure(error: unknown): ShellStatePortFailure {
  const record = typeof error === "object" && error !== null && !Array.isArray(error)
    ? error as Record<string, unknown>
    : null;
  const status = typeof record?.status === "number" ? record.status : null;
  if (status === 409) return new ShellStatePortFailure("conflict");
  const kinds: Record<string, ShellStateFailureCode> = {
    unauthorized: "unauthorized",
    forbidden: "forbidden",
    "invalid-request": "invalid-request",
    "invalid-payload": "invalid-response",
    network: "offline",
    "rate-limited": "rate-limited",
  };
  const kind = typeof record?.kind === "string" ? record.kind : "";
  return new ShellStatePortFailure(kinds[kind] ?? "error");
}

function isAbortError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "name" in error && error.name === "AbortError";
}

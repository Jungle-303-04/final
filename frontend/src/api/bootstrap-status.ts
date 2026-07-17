import { apiRequest, type ApiPath } from "./client";
import {
  runtimeDiagnosticsSchema,
  versionCheckSchema,
  type RuntimeDiagnosticsEndpoint,
  type VersionCheckEndpoint,
} from "./bootstrap-status-schemas";

export const RUNTIME_DIAGNOSTICS_PATH: ApiPath = "/api/diagnostics";
export const VERSION_CHECK_PATH: ApiPath = "/api/version-check";

export function getRuntimeDiagnostics(signal?: AbortSignal): Promise<RuntimeDiagnosticsEndpoint> {
  return apiRequest(RUNTIME_DIAGNOSTICS_PATH, runtimeDiagnosticsSchema, { signal });
}

export function getVersionCheck(signal?: AbortSignal): Promise<VersionCheckEndpoint> {
  return apiRequest(VERSION_CHECK_PATH, versionCheckSchema, { signal });
}

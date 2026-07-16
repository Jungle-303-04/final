export interface SettingsPermissionDecision {
  permission: string;
  category: string;
  allowed: boolean;
}

export interface SettingsUnavailableEvidence {
  status: "unavailable";
  reasonCode: string;
  detail: string;
}

export interface SettingsAccessProfile {
  workspaceId: string;
  userId: string;
  clusterId: string;
  roles: readonly string[];
  authority: "opsia_rbac";
  permissions: readonly SettingsPermissionDecision[];
  kubernetesRules: SettingsUnavailableEvidence;
  restrictedResourceTypes: SettingsUnavailableEvidence;
  revision: string;
}

export type SettingsFailureCode =
  | "unauthorized"
  | "forbidden"
  | "invalid-response"
  | "offline"
  | "rate-limited"
  | "error";

export class SettingsPortFailure extends Error {
  readonly code: SettingsFailureCode;

  constructor(code: SettingsFailureCode) {
    super(`Settings port failed: ${code}`);
    this.name = "SettingsPortFailure";
    this.code = code;
  }
}

export interface SettingsPort {
  getAccessProfile(clusterId: string, signal?: AbortSignal): Promise<SettingsAccessProfile>;
}

export const EMPTY_SETTINGS_PORT: SettingsPort = {
  getAccessProfile: () => Promise.reject(new SettingsPortFailure("error")),
};

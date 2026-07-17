import type { SettingsEndpointDependencies } from "./settingsEndpointContract";
import {
  SettingsPortFailure,
  type SettingsAccessProfile,
  type SettingsFailureCode,
  type SettingsPort,
  type SettingsUnavailableEvidence,
} from "./settingsContract";

export function createSettingsAdapter(
  endpoints: SettingsEndpointDependencies,
): SettingsPort {
  return {
    getAccessProfile: (clusterId, signal) => withPortFailure(async () => {
      const value = await endpoints.getSettingsAccessProfile(clusterId, signal);
      return {
        workspaceId: value.workspace_id,
        userId: value.user_id,
        clusterId: value.cluster_id,
        roles: [...value.roles],
        authority: value.authority,
        permissions: value.permissions.map((permission) => ({ ...permission })),
        kubernetesRules: unavailableEvidence(value.kubernetes_rules),
        restrictedResourceTypes: unavailableEvidence(value.restricted_resource_types),
        revision: value.revision,
      } satisfies SettingsAccessProfile;
    }),
  };
}

function unavailableEvidence(value: {
  status: "unavailable";
  reason_code: string;
  detail: string;
}): SettingsUnavailableEvidence {
  return {
    status: value.status,
    reasonCode: value.reason_code,
    detail: value.detail,
  };
}

async function withPortFailure<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (isAbortError(error) || error instanceof SettingsPortFailure) throw error;
    throw toPortFailure(error);
  }
}

function toPortFailure(error: unknown): SettingsPortFailure {
  const record = typeof error === "object" && error !== null && !Array.isArray(error)
    ? error as Record<string, unknown>
    : null;
  const kinds: Record<string, SettingsFailureCode> = {
    unauthorized: "unauthorized",
    forbidden: "forbidden",
    "invalid-payload": "invalid-response",
    network: "offline",
    "rate-limited": "rate-limited",
  };
  const kind = typeof record?.kind === "string" ? record.kind : "";
  return new SettingsPortFailure(kinds[kind] ?? "error");
}

function isAbortError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "name" in error && error.name === "AbortError";
}

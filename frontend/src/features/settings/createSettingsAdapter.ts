import type { SettingsEndpointDependencies } from "./settingsEndpointContract";
import {
  SettingsPortFailure,
  type SettingsAccessProfile,
  type SettingsFailureCode,
  type SettingsPort,
  type SettingsUnavailableEvidence,
  type PrometheusIntegrationStatus,
  type PrometheusIntegrationUpdate,
} from "./settingsContract";
import type { PrometheusIntegrationEndpoint } from "./settingsEndpointContract";

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
    getPrometheusIntegration: (clusterId, signal) => withPortFailure(async () => (
      integrationStatus(await endpoints.getPrometheusIntegration(clusterId, signal))
    )),
    updatePrometheusIntegration: (input, signal) => withPortFailure(async () => {
      const headers = integrationHeaders(input);
      return integrationStatus(await endpoints.updatePrometheusIntegration({
        clusterId: input.clusterId.trim(),
        prometheusUrl: input.url.trim(),
        headers,
      }, signal));
    }),
  };
}

function integrationHeaders(input: PrometheusIntegrationUpdate): Record<string, string> | undefined {
  if (input.headers === undefined) return undefined;
  const headers: Record<string, string> = {};
  const names = new Set<string>();
  for (const header of input.headers) {
    const name = header.name.trim();
    const value = header.value.trim();
    if (!name || !value || names.has(name.toLocaleLowerCase("en-US"))) {
      throw new SettingsPortFailure("invalid-request");
    }
    names.add(name.toLocaleLowerCase("en-US"));
    headers[name] = value;
  }
  return headers;
}

function integrationStatus(value: PrometheusIntegrationEndpoint): PrometheusIntegrationStatus {
  const receipt = value.receipt;
  return {
    clusterId: value.cluster_id,
    configurationRevision: value.revision,
    operationId: value.operation_id,
    url: value.address,
    headerNames: [...value.header_keys],
    state: value.state,
    errorCode: value.error_code,
    receipt: receipt ? {
      accepted: true,
      commandId: receipt.command_id,
      eventId: receipt.event_id,
      auditEventId: receipt.audit_event_id,
      correlationId: receipt.correlation_id,
      status: receipt.status,
    } : null,
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

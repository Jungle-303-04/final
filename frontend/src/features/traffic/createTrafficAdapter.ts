import {
  TrafficPortFailure,
  type TrafficFailureCode,
  type TrafficOverview,
  type TrafficPort,
  type TrafficSourceCommandInput,
  type TrafficSources,
} from "./trafficContract";
import type { TrafficEndpointDependencies } from "./trafficEndpointContract";
import type { CommandReceipt } from "../../shared/parity/referenceParity";

export function createTrafficAdapter(endpoints: TrafficEndpointDependencies): TrafficPort {
  return {
    async getOverview(request, signal) {
      return withPortFailure(async () => toOverview(await endpoints.getTrafficOverview({
        clusterIds: request.clusterIds,
        namespaces: request.namespaces,
      }, signal)));
    },
    async getSources(request, signal) {
      return withPortFailure(async () => toSources(await endpoints.getTrafficSources({
        clusterIds: request.clusterIds,
      }, signal)));
    },
    async selectSource(input, signal) {
      return executeSourceCommand(endpoints.setTrafficSource, input, signal);
    },
    async connectSource(input, signal) {
      return executeSourceCommand(endpoints.connectTrafficSource, input, signal);
    },
  };
}

async function executeSourceCommand(
  endpoint: TrafficEndpointDependencies["setTrafficSource"],
  input: TrafficSourceCommandInput,
  signal?: AbortSignal,
): Promise<CommandReceipt> {
  return withPortFailure(async () => {
    const receipt = await endpoint({
      scope: {
        workspace_id: input.scope.workspaceId,
        cluster_id: input.scope.clusterId,
        namespaces: input.scope.namespaces,
        freshness: input.scope.freshness,
      },
      source_key: input.sourceKey,
      capability_revision: input.capabilityRevision,
      confirmation: input.confirmation,
      reason: input.reason,
    }, input.idempotencyKey, signal);
    return {
      accepted: receipt.accepted,
      commandId: receipt.command_id,
      eventId: receipt.event_id,
      auditEventId: receipt.audit_event_id,
      correlationId: receipt.correlation_id,
      status: receipt.status,
    };
  });
}

function toSources(
  value: Awaited<ReturnType<TrafficEndpointDependencies["getTrafficSources"]>>,
): TrafficSources {
  return {
    availability: value.availability,
    coverage: {
      availability: value.coverage.availability,
      scopes: value.coverage.scopes.map(toScope),
      observedAt: value.coverage.observed_at,
      reasonCodes: value.coverage.reason_codes,
    },
    clusters: value.clusters.map((catalog) => ({
      scope: toScope(catalog.scope),
      freshness: catalog.freshness,
      observedAt: catalog.observed_at,
      activeSource: catalog.active_source,
      capabilityRevision: catalog.capability_revision,
      cluster: catalog.cluster === null ? null : {
        platform: catalog.cluster.platform,
        cni: catalog.cluster.cni,
        dataplaneV2: catalog.cluster.dataplane_v2,
        kubernetesVersion: catalog.cluster.kubernetes_version,
      },
      sources: catalog.sources.map((source) => ({
        key: source.key,
        label: source.label,
        status: source.status,
        version: source.version,
        native: source.native,
        message: source.message,
        actions: source.actions.map((action) => ({
          id: action.id,
          kind: action.kind,
          label: action.label,
          enabled: action.enabled,
          confirmationRequired: action.confirmation_required,
          reasonCode: action.reason_code,
        })),
      })),
      reasonCodes: catalog.reason_codes,
    })),
    reasonCodes: value.reason_codes,
  };
}

function toOverview(value: Awaited<ReturnType<TrafficEndpointDependencies["getTrafficOverview"]>>): TrafficOverview {
  return {
    scopeCoverage: {
      availability: value.scope_coverage.availability,
      scopes: value.scope_coverage.scopes.map(toScope),
      observedAt: value.scope_coverage.observed_at,
      reasonCodes: value.scope_coverage.reason_codes,
    },
    observation: {
      availability: value.observation.availability,
      observedAt: value.observation.observed_at,
      reasonCodes: value.observation.reason_codes,
    },
    summary: {
      availability: value.summary.availability,
      totalFlowCount: value.summary.total_flow_count,
      deniedFlowCount: value.summary.denied_flow_count,
      externalFlowCount: value.summary.external_flow_count,
      reasonCodes: value.summary.reason_codes,
    },
    relationships: {
      availability: value.relationships.availability,
      edges: value.relationships.edges,
      reasonCodes: value.relationships.reason_codes,
    },
  };
}

function toScope(scope: {
  workspace_id: string;
  cluster_id: string;
  namespaces: string[];
  freshness: "live" | "stale" | "partial" | "disconnected";
}) {
  return {
    workspaceId: scope.workspace_id,
    clusterId: scope.cluster_id,
    namespaces: scope.namespaces,
    freshness: scope.freshness,
  };
}

async function withPortFailure<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (isAbortError(error) || error instanceof TrafficPortFailure) throw error;
    throw toPortFailure(error);
  }
}

function toPortFailure(error: unknown): TrafficPortFailure {
  const kinds: Record<string, TrafficFailureCode> = {
    unauthorized: "unauthorized",
    forbidden: "forbidden",
    "invalid-request": "invalid-request",
    "invalid-payload": "invalid-response",
    "not-found": "not-found",
    network: "offline",
    "rate-limited": "rate-limited",
  };
  const record = typeof error === "object" && error !== null && !Array.isArray(error)
    ? error as Record<string, unknown>
    : null;
  const kind = typeof record?.kind === "string" ? record.kind : "";
  const retryAfter = typeof record?.retryAfter === "number" ? record.retryAfter : null;
  return new TrafficPortFailure(kinds[kind] ?? "error", retryAfter);
}

function isAbortError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "name" in error && error.name === "AbortError";
}

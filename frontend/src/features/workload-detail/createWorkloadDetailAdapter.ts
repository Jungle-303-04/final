import {
  WorkloadDetailPortFailure,
  type WorkloadDetail,
  type WorkloadDetailFailureCode,
  type WorkloadDetailPort,
  type WorkloadDetailResourceRef,
  type WorkloadDetailRequest,
} from "./workloadDetailContract";
import type { WorkloadDetailEndpointDependencies } from "./workloadDetailEndpointContract";
import type { WorkloadDetailEndpoint } from "./workloadDetailWireContract";

export function createWorkloadDetailAdapter(
  endpoints: WorkloadDetailEndpointDependencies,
): WorkloadDetailPort {
  return {
    async getDetail(request, signal) {
      try {
        return toDetail(request, await endpoints.getWorkloadDetail(request, signal));
      } catch (error) {
        if (isAbortError(error) || error instanceof WorkloadDetailPortFailure) throw error;
        throw toFailure(error);
      }
    },
  };
}

function toDetail(request: WorkloadDetailRequest, wire: WorkloadDetailEndpoint): WorkloadDetail {
  const detail = wire.detail;
  assertRequestIdentity(request, detail);
  return {
    scope: {
      workspaceId: detail.scope.workspace_id,
      clusterId: detail.scope.cluster_id,
      namespaces: detail.scope.namespaces,
      freshness: detail.scope.freshness,
    },
    observation: {
      resource: toResourceRef(detail.observation.resource),
      health: detail.observation.health,
      replicas: detail.observation.replicas,
      labels: detail.observation.labels,
      observedAt: detail.observation.observed_at,
    },
    coverage: {
      availability: detail.coverage.availability,
      observationSnapshotId: detail.coverage.observation_snapshot_id,
      latestSnapshotId: detail.coverage.latest_snapshot_id,
      observedAt: detail.coverage.observed_at,
      reasonCodes: detail.coverage.reason_codes,
    },
    pods: {
      availability: detail.pods.availability,
      items: detail.pods.items.map((item) => ({
        resource: toResourceRef(item.resource),
        health: item.health,
        observedAt: item.observed_at,
      })),
      excludedCount: detail.pods.excluded_count,
      reasonCodes: detail.pods.reason_codes,
    },
    events: {
      availability: detail.events.availability,
      items: detail.events.items.map((item) => ({
        resource: toResourceRef(item.resource),
        eventType: item.event_type,
        reason: item.reason,
        occurrenceCount: item.occurrence_count,
        lastOccurredAt: item.last_occurred_at,
      })),
      excludedCount: detail.events.excluded_count,
      reasonCodes: detail.events.reason_codes,
    },
    logStream: {
      availability: detail.log_stream.availability,
      streamKind: detail.log_stream.stream_kind,
      reasonCodes: detail.log_stream.reason_codes,
    },
    capabilities: {
      revision: detail.capabilities.revision,
      actions: detail.capabilities.actions,
    },
    features: detail.features.map((feature) => ({
      name: feature.name,
      availability: feature.availability,
      reasonCodes: feature.reason_codes,
    })),
  };
}

function assertRequestIdentity(
  request: WorkloadDetailRequest,
  detail: WorkloadDetailEndpoint["detail"],
): void {
  const resource = detail.observation.resource;
  if (
    detail.scope.cluster_id !== request.clusterId ||
    detail.capabilities.scope.cluster_id !== request.clusterId ||
    resource.api_group !== request.apiGroup ||
    resource.version !== request.apiVersion ||
    resource.kind.toLocaleLowerCase() !== request.kind.toLocaleLowerCase() ||
    resource.namespace !== request.namespace ||
    resource.name !== request.name
  ) {
    throw new WorkloadDetailPortFailure("invalid-response");
  }
}

function toResourceRef(value: WorkloadDetailEndpoint["detail"]["observation"]["resource"]): WorkloadDetailResourceRef {
  return {
    apiGroup: value.api_group,
    version: value.version,
    kind: value.kind,
    namespace: value.namespace,
    name: value.name,
    uid: value.uid,
  };
}

function toFailure(error: unknown): WorkloadDetailPortFailure {
  const status = numberField(error, "status");
  const kind = stringField(error, "kind");
  const byKind: Record<string, WorkloadDetailFailureCode> = {
    unauthorized: "unauthorized",
    forbidden: "forbidden",
    "not-found": "not-found",
    network: "offline",
    "invalid-request": "invalid-request",
    "invalid-payload": "invalid-response",
    "rate-limited": "rate-limited",
  };
  const byStatus: Record<number, WorkloadDetailFailureCode> = {
    401: "unauthorized",
    403: "forbidden",
    404: "not-found",
    409: "identity-incomplete",
    422: "invalid-request",
    429: "rate-limited",
    503: "unavailable",
  };
  return new WorkloadDetailPortFailure(byKind[kind ?? ""] ?? byStatus[status ?? -1] ?? "error");
}

function isAbortError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "name" in error && error.name === "AbortError";
}

function stringField(value: unknown, key: string): string | null {
  return typeof value === "object" && value !== null && key in value &&
    typeof (value as Record<string, unknown>)[key] === "string"
    ? (value as Record<string, string>)[key]
    : null;
}

function numberField(value: unknown, key: string): number | null {
  return typeof value === "object" && value !== null && key in value &&
    typeof (value as Record<string, unknown>)[key] === "number"
    ? (value as Record<string, number>)[key]
    : null;
}

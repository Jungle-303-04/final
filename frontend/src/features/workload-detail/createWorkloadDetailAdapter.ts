import {
  WorkloadDetailPortFailure,
  type WorkloadDetail,
  type WorkloadDetailFailureCode,
  type WorkloadDetailPort,
  type WorkloadDetailResourceRef,
  type WorkloadDetailRequest,
  type ScheduledRunCatalog,
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
    async getScheduledRuns(request, signal) {
      if (request.namespace === null) throw new WorkloadDetailPortFailure("invalid-request");
      try {
        const wire = await endpoints.getScheduledWorkloadRuns(
          request.clusterId,
          request.kind,
          request.namespace,
          request.name,
          signal,
        );
        return toScheduledRuns(request, wire);
      } catch (error) {
        if (isAbortError(error) || error instanceof WorkloadDetailPortFailure) throw error;
        throw toFailure(error);
      }
    },
  };
}

function toScheduledRuns(
  request: WorkloadDetailRequest,
  wire: import("./workloadDetailWireContract").ScheduledRunCatalogEndpoint,
): ScheduledRunCatalog {
  if (
    wire.scope.cluster_id !== request.clusterId ||
    wire.owner.kind.toLocaleLowerCase() !== request.kind.toLocaleLowerCase() ||
    wire.owner.namespace !== request.namespace ||
    wire.owner.name !== request.name
  ) throw new WorkloadDetailPortFailure("invalid-response");
  const runsByKey = new Map(wire.runs.map((run) => [run.run_key, run]));
  if (wire.lifecycle.some((event) => {
    const run = runsByKey.get(event.run_key);
    return run === undefined || run.resource.uid !== event.resource.uid;
  })) {
    throw new WorkloadDetailPortFailure("invalid-response");
  }
  return {
    scope: {
      workspaceId: wire.scope.workspace_id,
      clusterId: wire.scope.cluster_id,
      namespaces: wire.scope.namespaces,
      freshness: wire.scope.freshness,
    },
    owner: toResourceRef(wire.owner),
    runs: wire.runs.map((run) => ({
      runKey: run.run_key,
      resource: toResourceRef(run.resource),
      phase: run.phase,
      active: run.active,
      scheduledAt: run.scheduled_at,
      startedAt: run.started_at,
      finishedAt: run.finished_at,
      desired: run.desired,
      succeeded: run.succeeded,
      failed: run.failed,
      podTotal: run.pod_total,
      podSucceeded: run.pod_succeeded,
      podFailed: run.pod_failed,
      podRunning: run.pod_running,
      nextStep: run.next_step,
      observedAt: run.observed_at,
    })),
    lifecycle: wire.lifecycle.map((event) => ({
      eventId: event.event_id,
      runKey: event.run_key,
      resource: toResourceRef(event.resource),
      stage: event.stage,
      occurredAt: event.occurred_at,
      eventType: event.event_type,
      reason: event.reason,
    })),
    defaultRunKey: wire.default_run_key,
    complete: wire.complete,
    reasonCodes: wire.reason_codes,
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

function toResourceRef(value: import("./workloadDetailWireContract").WorkloadDetailWireResourceRef): WorkloadDetailResourceRef {
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

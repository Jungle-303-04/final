import {
  isResourcesAbortError,
  toResourcesPortFailure,
} from "./createResourcesAdapter";
import type {
  ResourceMetricsHistoryEndpointDependencies,
  ScopedMetricEndpointRun,
} from "./resourceMetricsHistoryEndpointContract";
import type {
  ResourceMetricHistoryPoint,
  ResourceMetricsHistoryPort,
} from "./resourceMetricsHistoryContract";
import { toResourceMetricsHistory } from "./resourceMetricsHistoryCanonical";
import { createResourceMetricsHistoryRequest } from "./resourcesFilterRequest";
import { ResourcesPortFailure } from "./resourcesContract";
import { ResourcesCanonicalError } from "./resourcesValidation";

export function createResourceMetricsHistoryAdapter(
  endpoints: ResourceMetricsHistoryEndpointDependencies,
): ResourceMetricsHistoryPort {
  const base: ResourceMetricsHistoryPort = {
    async loadResourceMetricsHistory(state, resourceIds, options, signal) {
      return withMetricsFailure(async () => {
        const query = createResourceMetricsHistoryRequest(state, resourceIds, options);
        return toResourceMetricsHistory(
          resourceIds,
          options.snapshotRevision,
          await endpoints.getResourceMetricsHistory(query, signal),
        );
      });
    },
  };
  if (endpoints.runScopedMetricQuery === undefined) {
    return base;
  }
  return {
    ...base,
    async loadScopedResourceMetrics(resource, range, signal) {
      return withMetricsFailure(async () => {
        const pvc = resource.kind === "PersistentVolumeClaim";
        const hpa = resource.kind === "HorizontalPodAutoscaler";
        const run = await endpoints.runScopedMetricQuery!({
          cluster_id: resource.clusterId,
          subject: pvc
            ? { kind: "pvc", resource_id: resource.inventoryKey }
            : { kind: "resource", resource_id: resource.inventoryKey },
          categories: pvc
            ? ["volume_usage"]
            : hpa
              ? ["hpa_current_replicas", "hpa_desired_replicas"]
              : ["cpu", "memory", "network_rx", "network_tx", "filesystem", "restarts"],
          range,
        }, { signal });
        return {
          series: toScopedSeries(resource.inventoryKey, run),
          completeness: run.completeness,
          partialReasonCodes: run.reasonCodes,
          refreshPolicyKey: run.endpoint.refresh_policy_key,
          source: "prometheus",
          freshness: run.endpoint.scope.freshness,
        };
      });
    },
  };
}

function toScopedSeries(
  resourceId: string,
  run: ScopedMetricEndpointRun,
) {
  const resource = run.endpoint.resource;
  if (resource === null || run.observations.length === 0) return null;
  const points = new Map<number, ResourceMetricHistoryPoint>();
  for (const observation of run.observations) {
    for (const series of observation.result.series) {
      for (const point of series.values) {
        if (point.timestamp === null || point.value === null) continue;
        const existing = points.get(point.timestamp) ?? {
          observedAt: new Date(point.timestamp * 1_000).toISOString(),
          cpuMillicores: null,
          memoryMebibytes: null,
          volumeUsagePercent: null,
          networkReceiveBytesPerSecond: null,
          networkTransmitBytesPerSecond: null,
          filesystemBytes: null,
          restartCount: null,
          hpaCurrentReplicas: null,
          hpaDesiredReplicas: null,
        };
        if (observation.category === "cpu") existing.cpuMillicores = point.value * 1_000;
        if (observation.category === "memory") {
          existing.memoryMebibytes = point.value / (1024 * 1024);
        }
        if (observation.category === "volume_usage") {
          existing.volumeUsagePercent = point.value * 100;
        }
        if (observation.category === "network_rx") {
          existing.networkReceiveBytesPerSecond = point.value;
        }
        if (observation.category === "network_tx") {
          existing.networkTransmitBytesPerSecond = point.value;
        }
        if (observation.category === "filesystem") existing.filesystemBytes = point.value;
        if (observation.category === "restarts") existing.restartCount = point.value;
        if (observation.category === "hpa_current_replicas") {
          existing.hpaCurrentReplicas = point.value;
        }
        if (observation.category === "hpa_desired_replicas") {
          existing.hpaDesiredReplicas = point.value;
        }
        points.set(point.timestamp, existing);
      }
    }
  }
  const ordered = [...points.entries()]
    .sort(([left], [right]) => left - right)
    .map(([, point]) => point);
  if (ordered.length === 0) return null;
  return {
    resourceId,
    clusterId: run.endpoint.scope.cluster_id,
    resourceType: resource.kind === "PersistentVolumeClaim"
      ? "pvc" as const
      : resource.kind === "HorizontalPodAutoscaler"
        ? "hpa" as const
      : resource.kind === "Node"
        ? "node" as const
        : "pod" as const,
    namespace: resource.namespace,
    name: resource.name,
    points: ordered,
    hasSparklinePoints: ordered.length > 1,
    completeness: run.completeness,
    partialReasonCodes: run.reasonCodes,
    source: "prometheus" as const,
    freshness: run.endpoint.scope.freshness,
  };
}

async function withMetricsFailure<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (isResourcesAbortError(error) || error instanceof ResourcesPortFailure) throw error;
    if (error instanceof TypeError || error instanceof RangeError) {
      throw new ResourcesPortFailure("invalid-request");
    }
    if (error instanceof ResourcesCanonicalError) {
      throw new ResourcesPortFailure("invalid-response");
    }
    throw toResourcesPortFailure(error);
  }
}

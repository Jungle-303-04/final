import type { PhysicalTopologySnapshot } from "./physicalTopologyContract";
import type { PhysicalTopologyEndpointResponse } from "./physicalTopologyEndpointContract";
import { ResourcesCanonicalError } from "./resourcesValidation";

export function toPhysicalTopology(
  requestedClusterId: string,
  value: PhysicalTopologyEndpointResponse,
): PhysicalTopologySnapshot {
  if (value.cluster.cluster_id !== requestedClusterId) {
    throw new ResourcesCanonicalError();
  }
  return {
    clusterId: value.cluster.cluster_id,
    clusterProjectionRevision: value.cluster_projection_revision,
    servers: value.servers.map((server) => ({
      id: server.id,
      name: server.name,
      cpuPercent: server.cpu_pct,
      memoryPercent: server.mem_pct,
      cpuMillicores: server.cpu_mcores,
      memoryMebibytes: server.mem_mib,
      allocatableCpuMillicores: server.allocatable_cpu_mcores,
      allocatableMemoryMebibytes: server.allocatable_mem_mib,
      podCapacity: server.pod_capacity,
      status: server.status,
      matchedPodCount: server.matched_pod_count,
      totalPodCount: server.total_pod_count,
      matchedPodCountCompleteness: server.matched_pod_count_completeness,
      totalPodCountCompleteness: server.total_pod_count_completeness,
    })),
    pods: value.pods.map((pod) => ({
      id: pod.id,
      name: pod.name,
      namespace: pod.namespace,
      serverId: pod.server_id,
      usagePercent: pod.usage_pct,
      cpuMillicores: pod.cpu_mcores,
      memoryMebibytes: pod.mem_mib,
      cpuRequestMillicores: pod.cpu_request_mcores,
      memoryRequestMebibytes: pod.mem_request_mib,
      cpuLimitMillicores: pod.cpu_limit_mcores,
      memoryLimitMebibytes: pod.mem_limit_mib,
      phase: pod.phase,
      health: pod.health,
      restartCount: pod.restarts,
      matchesFilter: pod.matches_filter,
    })),
    truncatedByServer: value.truncated,
    unassignedTruncatedCount: value.unassigned_truncated_count,
    counts: {
      filteredCount: value.counts.filtered_count,
      unfilteredCount: value.counts.unfiltered_count,
      filteredCountCompleteness: value.counts.filtered_count_completeness,
      unfilteredCountCompleteness: value.counts.unfiltered_count_completeness,
    },
    projectionCompleteness: value.projection_completeness,
    metricsCompleteness: value.metrics_completeness,
    metricsObservedAt: value.metrics_observed_at,
    partialReasonCodes: value.partial_reason_codes,
    snapshot: {
      snapshotRevision: value.snapshot.snapshot_revision,
      authorizationRevision: value.snapshot.authorization_revision,
      filterFingerprint: value.snapshot.filter_fingerprint,
      observedAt: value.snapshot.observed_at,
      stale: value.snapshot.stale,
      partialReasonCodes: value.snapshot.partial_reason_codes,
    },
  };
}

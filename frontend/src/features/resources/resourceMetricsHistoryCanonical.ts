import type { ResourceMetricsHistoryBatch } from "./resourceMetricsHistoryContract";
import type { ResourceMetricsHistoryEndpointResponse } from "./resourceMetricsHistoryEndpointContract";
import { ResourcesCanonicalError } from "./resourcesValidation";

export function toResourceMetricsHistory(
  requestedIds: string[],
  requestedSnapshotRevision: number,
  value: ResourceMetricsHistoryEndpointResponse,
): ResourceMetricsHistoryBatch {
  const returnedIds = value.series.map((series) => series.resource_id);
  if (!sameIdentitySet(requestedIds, returnedIds) ||
    value.snapshot.snapshot_revision !== requestedSnapshotRevision) {
    throw new ResourcesCanonicalError();
  }
  return {
    refreshPolicyKey: value.refresh_policy_key,
    series: value.series.map((series) => ({
      resourceId: series.resource_id,
      clusterId: series.cluster_id,
      resourceType: series.resource_type,
      namespace: series.namespace,
      name: series.name,
      points: series.points.map((point) => ({
        observedAt: point.observed_at,
        cpuMillicores: point.cpu_mcores,
        memoryMebibytes: point.mem_mib,
      })),
      hasSparklinePoints: series.has_sparkline_points,
      completeness: series.completeness,
      partialReasonCodes: series.partial_reason_codes,
    })),
    completeness: value.completeness,
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

function sameIdentitySet(left: string[], right: string[]): boolean {
  if (left.length !== right.length) return false;
  const expected = new Set(left);
  return expected.size === left.length && right.every((id) => expected.has(id));
}

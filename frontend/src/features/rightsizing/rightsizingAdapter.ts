import type {
  RightsizingObservedWorkloadEndpoint,
  RightsizingWorkloadEvidenceEndpoint,
} from "./rightsizingEndpointContract";
import type {
  RightsizingObservedWorkload,
  RightsizingScan,
  RightsizingWorkloadEvidence,
} from "./rightsizingContract";

export function toRightsizingEvidence(
  evidence: RightsizingWorkloadEvidenceEndpoint,
): RightsizingWorkloadEvidence {
  if (evidence.availability === "unavailable") {
    return { availability: "unavailable", reasonCodes: [...evidence.reason_codes] };
  }
  return toObservedRightsizing(evidence);
}

export function toObservedRightsizing(
  evidence: RightsizingObservedWorkloadEndpoint,
): RightsizingObservedWorkload {
  return {
    availability: evidence.availability,
    resource: {
      apiGroup: evidence.resource.api_group,
      version: evidence.resource.version,
      kind: evidence.resource.kind,
      namespace: evidence.resource.namespace,
      name: evidence.resource.name,
      uid: evidence.resource.uid,
    },
    observedAt: evidence.observed_at,
    freshness: evidence.freshness,
    provenance: {
      collector: evidence.provenance.collector,
      algorithmRevision: evidence.provenance.algorithm_revision,
      sourceRevision: evidence.provenance.source_revision,
      windowStartedAt: evidence.provenance.window_started_at,
      windowEndedAt: evidence.provenance.window_ended_at,
      sampleIntervalSeconds: evidence.provenance.sample_interval_seconds,
    },
    replicas: evidence.replicas,
    scaledToZero: evidence.scaled_to_zero,
    classification: evidence.classification,
    impact: {
      replicas: evidence.impact.replicas,
      cpuMillicoresChange: evidence.impact.cpu_millicores_change,
      memoryBytesChange: evidence.impact.memory_bytes_change,
    },
    rows: evidence.rows.map((row) => ({
      container: row.container,
      resource: row.resource,
      fit: row.fit,
      action: row.action,
      confidence: row.confidence,
      currentRequest: row.current_request,
      observedDemand: row.observed_demand,
      recommendedRequest: row.recommended_request,
      sampleCount: row.sample_count,
      expectedSamples: row.expected_samples,
      coverageBasisPoints: row.coverage_basis_points,
      signals: [...row.signals],
      reasonCodes: [...row.reason_codes],
    })),
    reasonCodes: [...evidence.reason_codes],
  };
}

export function toRightsizingScan(
  scan: import("./rightsizingEndpointContract").RightsizingScanEndpoint,
): RightsizingScan {
  return {
    scope: {
      workspaceId: scan.scope.workspace_id,
      clusterId: scan.scope.cluster_id,
      namespaces: [...scan.scope.namespaces],
      freshness: scan.scope.freshness,
    },
    namespaceScope: [...scan.namespace_scope],
    result: scan.result.availability === "unavailable"
      ? {
        availability: "unavailable",
        reasonCodes: [...scan.result.reason_codes],
      }
      : {
        availability: scan.result.availability,
        observedAt: scan.result.observed_at,
        provenance: {
          collector: scan.result.provenance.collector,
          algorithmRevision: scan.result.provenance.algorithm_revision,
          sourceRevision: scan.result.provenance.source_revision,
          windowStartedAt: scan.result.provenance.window_started_at,
          windowEndedAt: scan.result.provenance.window_ended_at,
          sampleIntervalSeconds: scan.result.provenance.sample_interval_seconds,
        },
        coverage: {
          workloadsDiscovered: scan.result.coverage.workloads_discovered,
          workloadsEvaluated: scan.result.coverage.workloads_evaluated,
          workloadsWithData: scan.result.coverage.workloads_with_data,
          truncated: scan.result.coverage.truncated,
        },
        workloads: scan.result.workloads.map(toObservedRightsizing),
        failures: scan.result.failures.map((failure) => ({
          resource: failure.resource === null ? null : {
            apiGroup: failure.resource.api_group,
            version: failure.resource.version,
            kind: failure.resource.kind,
            namespace: failure.resource.namespace,
            name: failure.resource.name,
            uid: failure.resource.uid,
          },
          reasonCode: failure.reason_code,
        })),
        reasonCodes: [...scan.result.reason_codes],
      },
    refreshAfterSeconds: scan.refresh_after_seconds,
  };
}

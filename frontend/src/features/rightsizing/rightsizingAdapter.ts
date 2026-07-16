import type {
  RightsizingObservedWorkloadEndpoint,
  RightsizingWorkloadEvidenceEndpoint,
} from "./rightsizingEndpointContract";
import type {
  RightsizingObservedWorkload,
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

function toObservedRightsizing(
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

import type {
  HomeDataQualityWarning,
  HomeIncidentSummary,
  HomeUsageSnapshot,
  HomeWarningSummary,
  HomeWorkloadSummary,
} from "./homeContract";
import type {
  HomeEndpointIncident,
  HomeEndpointUsage,
  HomeEndpointWarning,
  HomeEndpointWorkload,
} from "./homeEndpointContract";
import {
  canonicalIdentity,
  canonicalOptionalIdentity,
  canonicalOptionalText,
  canonicalTimestamp,
  ephemeralId,
  healthTone,
  invalidResponse,
  nonNegativeInteger,
  percentage,
} from "./homeValidation";

export function toUsage(wire: HomeEndpointUsage): HomeUsageSnapshot {
  const podsRunning = nonNegativeInteger(wire.pods_running);
  const podsTotal = requiredNonNegativeInteger(wire.pods_total);
  const nodesReady = nonNegativeInteger(wire.nodes_ready);
  const nodesTotal = nonNegativeInteger(wire.nodes_total);
  if (
    (podsTotal > 0 && podsRunning > podsTotal) ||
    (nodesTotal > 0 && nodesReady > nodesTotal)
  ) {
    invalidResponse();
  }
  return {
    observedAt: canonicalTimestamp(wire.sampled_at),
    podsRunning,
    podsTotal,
    nodesReady,
    nodesTotal,
    restartCount: nonNegativeInteger(wire.restart_total),
    cpuPercent: percentage(wire.cpu_pct),
    memoryPercent: percentage(wire.mem_pct),
  };
}

function requiredNonNegativeInteger(value: number | undefined): number {
  if (value === undefined) invalidResponse();
  return nonNegativeInteger(value);
}

export function toWorkload(
  clusterId: string,
  wire: HomeEndpointWorkload,
  dataQualityWarnings: HomeDataQualityWarning[],
): HomeWorkloadSummary {
  const name = canonicalIdentity(wire.name);
  const kind = canonicalIdentity(wire.kind);
  const namespace = canonicalOptionalIdentity(wire.namespace);
  const id = ephemeralId("workload", clusterId, namespace ?? "", kind, name);
  const ready = canonicalOptionalText(wire.ready);
  const reportedHealth = healthTone(wire.health);
  if (ready === null) {
    dataQualityWarnings.push({
      code: "workload-readiness-unavailable",
      section: "workloads",
      entityId: id,
    });
  }
  return {
    id,
    identityStability: "ephemeral",
    name,
    kind,
    namespace,
    health: ready === null && ["healthy", "unknown"].includes(reportedHealth)
      ? "warning"
      : reportedHealth,
    ready: ready ?? "—",
    restartCount: nonNegativeInteger(wire.restarts),
  };
}

export function toWarning(
  clusterId: string,
  wire: HomeEndpointWarning,
): HomeWarningSummary {
  const name = canonicalIdentity(wire.name);
  const namespace = canonicalOptionalIdentity(wire.namespace);
  return {
    id: ephemeralId("warning", clusterId, namespace ?? "", name),
    identityStability: "ephemeral",
    name,
    namespace,
    reason: canonicalOptionalText(wire.reason),
    message: canonicalOptionalText(wire.message),
    involvedKind: canonicalOptionalIdentity(wire.involved_kind),
    involvedName: canonicalOptionalIdentity(wire.involved_name),
    occurrenceCount: nonNegativeInteger(wire.count),
    lastSeenAt: canonicalTimestamp(wire.last_seen_at),
  };
}

export function toIncident(
  clusterId: string,
  index: number,
  wire: HomeEndpointIncident,
  dataQualityWarnings: HomeDataQualityWarning[],
): HomeIncidentSummary {
  const correlationId = canonicalIdentity(wire.correlation_id);
  const incidentId = wire.incident_id.trim() === ""
    ? null
    : canonicalIdentity(wire.incident_id);
  const id = incidentId ?? ephemeralId("incident-row", clusterId, correlationId, String(index));
  if (incidentId === null) {
    dataQualityWarnings.push({
      code: "incident-link-unavailable",
      section: "incidents",
      entityId: id,
    });
  }
  return {
    id,
    incidentId,
    correlationId,
    symptom: canonicalOptionalText(wire.symptom),
    rootCause: canonicalOptionalText(wire.root_cause),
    namespace: canonicalOptionalIdentity(wire.namespace),
    resourceKind: canonicalOptionalIdentity(wire.resource_kind),
    resourceName: canonicalOptionalIdentity(wire.resource_name),
    status: canonicalIdentity(wire.status),
    createdAt: canonicalTimestamp(wire.created_at),
  };
}

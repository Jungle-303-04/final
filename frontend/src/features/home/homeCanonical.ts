import type {
  HomeClusterChoice,
  HomeClusterChoices,
  HomeClusterOverview,
  HomeDataQualityWarning,
  HomeNodeCollection,
  HomeNodeSummary,
  HomeInsights,
  HomePodCollection,
  HomePodOwner,
  HomePodReadiness,
  HomePodSummary,
  HomeUsageSnapshot,
} from "./homeContract";
import type {
  HomeEndpointClusterList,
  HomeEndpointClusterOverview,
  HomeEndpointClusterSummary,
  HomeEndpointInsightCoverage,
  HomeEndpointInsights,
  HomeEndpointNode,
  HomeEndpointNodeCollection,
  HomeEndpointPod,
  HomeEndpointPodCollection,
} from "./homeEndpointContract";
import {
  toIncident,
  toUsage,
  toWarning,
  toWorkload,
} from "./homeOverviewCanonical";
import {
  assertSameIdentity,
  assertUnique,
  canonicalDisplayLabel,
  canonicalIdentity,
  canonicalOptionalIdentity,
  canonicalTimestamp,
  connectionState,
  ephemeralId,
  healthTone,
  invalidResponse,
  isHomeCanonicalError,
  nonNegativeInteger,
  nonNegativeNumber,
  percentage,
  registrationState,
} from "./homeValidation";

export function toClusterChoices(wire: HomeEndpointClusterList): HomeClusterChoices {
  const clusters = wire.clusters.map(toClusterChoice);
  assertUnique(clusters.map(({ id }) => id));
  return { completeness: "unknown", clusters };
}

function toClusterChoice(wire: HomeEndpointClusterSummary): HomeClusterChoice {
  canonicalOptionalIdentity(wire.last_agent_id);
  canonicalTimestamp(wire.created_at);
  canonicalTimestamp(wire.updated_at);
  const id = canonicalIdentity(wire.cluster_id);
  const nodeCount = nullableNonNegativeInteger(wire.node_count);
  const podCount = nullableNonNegativeInteger(wire.pod_count);
  const incidentCount = nullableNonNegativeInteger(wire.incident_count);
  const serverCount = nullableNonNegativeInteger(wire.server_count);
  const appCount = nullableNonNegativeInteger(wire.app_count);
  const openIncidentCount = nullableNonNegativeInteger(wire.open_incidents);

  return {
    id,
    workspaceId: canonicalIdentity(wire.workspace_id),
    name: canonicalDisplayLabel(wire.name, id),
    environment: canonicalDisplayLabel(wire.environment, "unknown"),
    provider: wire.provider ?? "unknown",
    connectionStage: wire.connection_stage ?? null,
    registrationState: registrationState(canonicalIdentity(wire.status)),
    connectionState: connectionState(canonicalIdentity(wire.connection_status)),
    lastObservedAt: canonicalTimestamp(wire.last_seen_at ?? wire.last_agent_seen_at),
    nodeCount,
    podCount,
    incidentCount,
    serverCount,
    appCount,
    openIncidentCount,
  };
}

function nullableNonNegativeInteger(value: number | null | undefined): number | null {
  return value === null || value === undefined ? null : nonNegativeInteger(value);
}

export function toClusterOverview(
  requestedClusterId: string,
  wire: HomeEndpointClusterOverview,
): HomeClusterOverview {
  const clusterId = canonicalIdentity(requestedClusterId);
  assertSameIdentity(wire.cluster_id, clusterId);
  const dataQualityWarnings: HomeDataQualityWarning[] = [];
  const workloads = Object.values(wire.workloads).flatMap((items) =>
    items.map((item) => toWorkload(clusterId, item, dataQualityWarnings))
  ).sort((left, right) => left.id.localeCompare(right.id));
  const warnings = wire.warning_events.map((item) => toWarning(clusterId, item));
  const incidents = wire.open_incidents.map((item, index) =>
    toIncident(clusterId, index, item, dataQualityWarnings)
  );
  assertUnique(workloads.map(({ id }) => id));
  assertUnique(warnings.map(({ id }) => id));
  assertUnique(incidents.map(({ id }) => id));

  let usage: HomeUsageSnapshot | null = null;
  if (wire.usage !== null) {
    try {
      usage = toUsage(wire.usage);
    } catch (error) {
      if (!isHomeCanonicalError(error)) throw error;
      dataQualityWarnings.push({
        code: "usage-unavailable",
        section: "usage",
        entityId: null,
      });
    }
  }

  return {
    clusterId,
    name: canonicalDisplayLabel(wire.name, clusterId),
    health: healthTone(wire.health),
    usage,
    workloads,
    warnings,
    incidents,
    dataQualityWarnings,
  };
}

export function toHomeInsights(
  requestedClusterId: string,
  wire: HomeEndpointInsights,
): HomeInsights {
  const clusterId = canonicalIdentity(requestedClusterId);
  assertSameIdentity(wire.cluster_id, clusterId);
  const customCoverage = toInsightCoverage(wire.custom_resources.coverage);
  const customItems = wire.custom_resources.items.map((item) => {
    const count = nonNegativeInteger(item.count);
    if (count === 0) invalidResponse();
    return {
      apiGroup: canonicalIdentity(item.api_group),
      version: canonicalIdentity(item.version),
      kind: canonicalIdentity(item.kind),
      count,
    };
  });
  assertUnique(customItems.map((item) =>
    `${item.apiGroup}/${item.version}/${item.kind}`
  ));
  const totalKinds = nullableNonNegativeInteger(wire.custom_resources.total_kinds);
  const totalResources = nullableNonNegativeInteger(wire.custom_resources.total_resources);
  const customUnavailable = customCoverage.availability === "unavailable";
  if (
    customUnavailable !== (totalKinds === null) ||
    customUnavailable !== (totalResources === null) ||
    (customUnavailable && (customItems.length > 0 || wire.custom_resources.has_more)) ||
    (totalKinds !== null && totalKinds < customItems.length) ||
    (totalResources !== null &&
      totalResources < customItems.reduce((total, item) => total + item.count, 0)) ||
    wire.custom_resources.has_more !== (
      totalKinds !== null && totalKinds > customItems.length
    )
  ) {
    invalidResponse();
  }
  const helmCoverage = toInsightCoverage(wire.helm.coverage);
  const releaseCount = nullableNonNegativeInteger(wire.helm.release_count);
  if (Object.keys(wire.helm.status_counts).length > 20) invalidResponse();
  const statusCounts = Object.fromEntries(
    Object.entries(wire.helm.status_counts).map(([status, count]) => {
      const normalized = canonicalIdentity(status);
      if (normalized.length > 120) invalidResponse();
      const normalizedCount = nonNegativeInteger(count);
      if (normalizedCount === 0) invalidResponse();
      return [normalized, normalizedCount];
    }),
  );
  const helmUnavailable = helmCoverage.availability === "unavailable";
  if (
    helmUnavailable !== (releaseCount === null) ||
    (helmUnavailable && Object.keys(statusCounts).length > 0) ||
    (releaseCount !== null &&
      Object.values(statusCounts).reduce((total, count) => total + count, 0) > releaseCount)
  ) {
    invalidResponse();
  }
  const refreshAfterSeconds = nonNegativeInteger(wire.refresh_after_seconds);
  if (refreshAfterSeconds < 1 || refreshAfterSeconds > 3600) invalidResponse();
  return {
    clusterId,
    customResources: {
      coverage: customCoverage,
      items: customItems,
      totalKinds,
      totalResources,
      hasMore: wire.custom_resources.has_more,
    },
    helm: {
      coverage: helmCoverage,
      releaseCount,
      statusCounts,
    },
    refreshAfterSeconds,
  };
}

function toInsightCoverage(wire: HomeEndpointInsightCoverage) {
  if (wire.availability !== "available" && wire.reason_codes.length === 0) invalidResponse();
  const reasonCodes = wire.reason_codes.map(canonicalIdentity);
  assertUnique(reasonCodes);
  return {
    availability: wire.availability,
    observedAt: canonicalTimestamp(wire.observed_at),
    reasonCodes,
  };
}

export function toNodeCollection(
  requestedClusterId: string,
  wire: HomeEndpointNodeCollection,
): HomeNodeCollection {
  const clusterId = canonicalIdentity(requestedClusterId);
  assertSameIdentity(wire.cluster_id, clusterId);
  const nodes = wire.nodes.map((node) => toNode(clusterId, node));
  assertUnique(nodes.map(({ id }) => id));
  return { clusterId, completeness: "unknown", nodes };
}

function toNode(clusterId: string, wire: HomeEndpointNode): HomeNodeSummary {
  const name = canonicalIdentity(wire.name);
  const podsRunning = nonNegativeInteger(wire.pods_running);
  const podsCapacity = nonNegativeInteger(wire.pods_capacity);
  const conditions = wire.conditions.map(canonicalIdentity);
  assertUnique(conditions);
  return {
    id: ephemeralId("node", clusterId, name),
    identityStability: "ephemeral",
    name,
    ready: wire.ready,
    health: healthTone(wire.health),
    podsRunning,
    podsCapacity,
    cpuPercent: percentage(wire.cpu_pct),
    memoryPercent: percentage(wire.mem_pct),
    restartCount: nonNegativeInteger(wire.restarts_recent),
    conditions: [...conditions].sort((left, right) => left.localeCompare(right)),
  };
}

export function toPodCollection(
  requestedClusterId: string,
  requestedNodeName: string,
  wire: HomeEndpointPodCollection,
): HomePodCollection {
  const clusterId = canonicalIdentity(requestedClusterId);
  const nodeName = canonicalIdentity(requestedNodeName);
  assertSameIdentity(wire.cluster_id, clusterId);
  assertSameIdentity(wire.node_name, nodeName);
  const pods = wire.pods.map((pod) => toPod(clusterId, nodeName, pod));
  assertUnique(pods.map(({ id }) => id));
  return { clusterId, nodeName, completeness: "unknown", pods };
}

function toPod(clusterId: string, nodeName: string, wire: HomeEndpointPod): HomePodSummary {
  const name = canonicalIdentity(wire.name);
  const namespace = canonicalIdentity(wire.namespace);
  return {
    id: ephemeralId("pod", clusterId, nodeName, namespace, name),
    identityStability: "ephemeral",
    name,
    namespace,
    phase: canonicalIdentity(wire.phase),
    health: healthTone(wire.health),
    readiness: toReadiness(wire.ready),
    restartCount: nonNegativeInteger(wire.restarts),
    owner: toOwner(wire.owner_kind, wire.owner_name),
    cpuMillicores: nonNegativeNumber(wire.cpu_mcores),
    memoryMebibytes: nonNegativeNumber(wire.mem_mib),
    incidentCorrelationId: canonicalOptionalIdentity(wire.incident_correlation_id),
  };
}

function toReadiness(value: string): HomePodReadiness {
  const match = /^(\d+)\/(\d+)$/.exec(value);
  if (match === null) invalidResponse();
  const ready = Number(match[1]);
  const total = Number(match[2]);
  if (!Number.isSafeInteger(ready) || !Number.isSafeInteger(total) || ready > total) {
    invalidResponse();
  }
  return { ready, total };
}

function toOwner(kind: string | null, name: string | null): HomePodOwner | null {
  if (kind === null && name === null) return null;
  if (kind === null || name === null) return null;
  return { kind: canonicalIdentity(kind), name: canonicalIdentity(name) };
}

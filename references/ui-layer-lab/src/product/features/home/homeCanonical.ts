import type {
  HomeClusterChoice,
  HomeClusterChoices,
  HomeClusterOverview,
  HomeDataQualityWarning,
  HomeNodeCollection,
  HomeNodeSummary,
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
  const nodeCount = nonNegativeInteger(wire.node_count);
  const podCount = nonNegativeInteger(wire.pod_count);
  const incidentCount = nonNegativeInteger(wire.incident_count);

  return {
    id,
    workspaceId: canonicalIdentity(wire.workspace_id),
    name: canonicalDisplayLabel(wire.name, id),
    environment: canonicalDisplayLabel(wire.environment, "unknown"),
    provider: wire.provider ?? "unknown",
    registrationState: registrationState(canonicalIdentity(wire.status)),
    connectionState: connectionState(canonicalIdentity(wire.connection_status)),
    lastObservedAt: canonicalTimestamp(wire.last_agent_seen_at),
    nodeCount,
    podCount,
    incidentCount,
  };
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
  if (podsCapacity > 0 && podsRunning > podsCapacity) invalidResponse();
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

import type {
  RelationTopologyEdge,
  RelationTopologyEdgeType,
  RelationTopologyNode,
  RelationTopologySnapshot,
} from "./relationTopologyContract";
import type { ResourceIdentity, ResourceSummary } from "./resourcesContract";

export type RelationHealthTone = "healthy" | "warning" | "critical" | "unknown";

export interface RelationTopologyGraphNode {
  resource: RelationTopologyNode;
  degree: number;
  visibleDegree: number;
  hiddenRelationCount: number;
  tone: RelationHealthTone;
}

export interface RelationTopologyGraphEdge extends RelationTopologyEdge {
  id: string;
  tone: RelationHealthTone;
}

export interface RelationTopologyGraphModel {
  connected: RelationTopologyGraphNode[];
  disconnected: RelationTopologyGraphNode[];
  edges: RelationTopologyGraphEdge[];
  edgeCounts: Record<RelationTopologyEdgeType, number>;
  signature: string;
}

const EDGE_TYPES: readonly RelationTopologyEdgeType[] = [
  "owns",
  "runs_on",
  "selects",
  "routes_to",
];

const TONE_PRIORITY: Record<RelationHealthTone, number> = {
  healthy: 0,
  unknown: 1,
  warning: 2,
  critical: 3,
};

export function buildRelationTopologyGraphModel(
  topology: RelationTopologySnapshot,
  hiddenKinds: ReadonlySet<string>,
): RelationTopologyGraphModel {
  const nodesById = new Map(topology.nodes.map((node) => [node.id, node] as const));
  const totalDegree = new Map<string, number>(topology.nodes.map((node) => [node.id, 0]));
  for (const edge of topology.edges) {
    totalDegree.set(edge.from, (totalDegree.get(edge.from) ?? 0) + 1);
    totalDegree.set(edge.to, (totalDegree.get(edge.to) ?? 0) + 1);
  }

  const visibleNodes = topology.nodes
    .filter((node) => !hiddenKinds.has(node.kind))
    .sort(compareRelationNodes);
  const visibleIds = new Set(visibleNodes.map((node) => node.id));
  const visibleEdges = topology.edges
    .filter((edge) => visibleIds.has(edge.from) && visibleIds.has(edge.to))
    .map((edge) => ({
      ...edge,
      id: relationTopologyEdgeId(edge),
      tone: strongestTone(
        relationNodeHealthTone(nodesById.get(edge.from)?.status ?? ""),
        relationNodeHealthTone(nodesById.get(edge.to)?.status ?? ""),
      ),
    }))
    .sort(compareRelationEdges);
  const visibleDegree = new Map<string, number>(visibleNodes.map((node) => [node.id, 0]));
  for (const edge of visibleEdges) {
    visibleDegree.set(edge.from, (visibleDegree.get(edge.from) ?? 0) + 1);
    visibleDegree.set(edge.to, (visibleDegree.get(edge.to) ?? 0) + 1);
  }

  const nodes = visibleNodes.map((resource) => {
    const degree = totalDegree.get(resource.id) ?? 0;
    const shownDegree = visibleDegree.get(resource.id) ?? 0;
    return {
      resource,
      degree,
      visibleDegree: shownDegree,
      hiddenRelationCount: Math.max(0, degree - shownDegree),
      tone: relationNodeHealthTone(resource.status),
    } satisfies RelationTopologyGraphNode;
  });
  const edgeCounts = Object.fromEntries(EDGE_TYPES.map((type) => [type, 0])) as Record<
    RelationTopologyEdgeType,
    number
  >;
  for (const edge of visibleEdges) edgeCounts[edge.type] += 1;
  const signature = [
    nodes.map((node) => node.resource.id).join("|"),
    visibleEdges.map((edge) => edge.id).join("|"),
  ].join("::");

  return {
    connected: nodes.filter((node) => node.degree > 0),
    disconnected: nodes.filter((node) => node.degree === 0),
    edges: visibleEdges,
    edgeCounts,
    signature,
  };
}

export function relationNodeHealthTone(status: string): RelationHealthTone {
  const normalized = status.trim().toLocaleLowerCase().replace(/[^a-z0-9]+/g, "");
  if (!normalized) return "unknown";
  if ([
    "crashloop",
    "error",
    "failed",
    "oom",
    "imagepull",
    "unhealthy",
    "notready",
    "evicted",
    "unschedulable",
  ].some((token) => normalized.includes(token))) return "critical";
  if ([
    "pending",
    "degraded",
    "progressing",
    "terminating",
    "warning",
    "unknown",
  ].some((token) => normalized.includes(token))) return "warning";
  if ([
    "ready",
    "running",
    "available",
    "active",
    "bound",
    "succeeded",
    "completed",
    "healthy",
  ].some((token) => normalized.includes(token))) return "healthy";
  return "unknown";
}

export function relationTopologyEdgeId(edge: RelationTopologyEdge): string {
  return `relation:${edge.type}:${edge.from}:${edge.to}`;
}

export function exactRelationResourceIdentity(
  nodeId: string,
  resources: readonly ResourceSummary[],
): ResourceIdentity | null {
  const resource = resources.find((candidate) => candidate.inventoryKey === nodeId);
  return resource ? {
    resourceType: resource.resourceType,
    kind: resource.kind,
    namespace: resource.namespace,
    name: resource.name,
  } : null;
}

export function exactRelationNodeId(
  identity: ResourceIdentity | null,
  resources: readonly ResourceSummary[],
): string | null {
  if (identity === null) return null;
  return resources.find((candidate) =>
    candidate.resourceType === identity.resourceType &&
    candidate.kind === identity.kind &&
    candidate.namespace === identity.namespace &&
    candidate.name === identity.name
  )?.inventoryKey ?? null;
}

function strongestTone(left: RelationHealthTone, right: RelationHealthTone): RelationHealthTone {
  return TONE_PRIORITY[left] >= TONE_PRIORITY[right] ? left : right;
}

function compareRelationNodes(left: RelationTopologyNode, right: RelationTopologyNode): number {
  return left.kind.localeCompare(right.kind) ||
    left.name.localeCompare(right.name) ||
    left.id.localeCompare(right.id);
}

function compareRelationEdges(
  left: RelationTopologyGraphEdge,
  right: RelationTopologyGraphEdge,
): number {
  return left.type.localeCompare(right.type) || left.from.localeCompare(right.from) ||
    left.to.localeCompare(right.to);
}

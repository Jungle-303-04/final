import type { RelationTopologyEndpointResponse } from "./relationTopologyEndpointContract";
import type { RelationTopologySnapshot } from "./relationTopologyContract";
import { ResourcesCanonicalError } from "./resourcesValidation";

export function toRelationTopology(
  value: RelationTopologyEndpointResponse,
): RelationTopologySnapshot {
  const ids = new Set<string>();
  for (const node of value.nodes) {
    if (!node.id || !node.kind || !node.name || ids.has(node.id)) {
      throw new ResourcesCanonicalError();
    }
    ids.add(node.id);
  }
  const edges = new Set<string>();
  for (const edge of value.edges) {
    const key = `${edge.from}\u0000${edge.to}\u0000${edge.type}`;
    if (!ids.has(edge.from) || !ids.has(edge.to) || edges.has(key)) {
      throw new ResourcesCanonicalError();
    }
    edges.add(key);
  }
  return {
    nodes: value.nodes.map((node) => ({ ...node })),
    edges: value.edges.map((edge) => ({ ...edge })),
  };
}

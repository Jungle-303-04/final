import type { RelationTopologyEndpointResponse } from "./relationTopologyEndpointContract";
import type { RelationTopologySnapshot } from "./relationTopologyContract";
import { ResourcesCanonicalError } from "./resourcesValidation";

export function toRelationTopology(
  requestedClusterId: string,
  value: RelationTopologyEndpointResponse,
): RelationTopologySnapshot {
  if (value.view !== "relations" || value.cluster.cluster_id !== requestedClusterId) {
    throw new ResourcesCanonicalError();
  }
  const nodeIds = new Set(value.nodes.map((node) => node.node_id));
  const edgeIds = new Set(value.edges.map((edge) => edge.edge_id));
  if (
    nodeIds.size !== value.nodes.length ||
    edgeIds.size !== value.edges.length ||
    value.nodes.some((node) => node.identity.cluster_id !== requestedClusterId) ||
    value.edges.some((edge) => !nodeIds.has(edge.from_node_id) || !nodeIds.has(edge.to_node_id))
  ) {
    throw new ResourcesCanonicalError();
  }
  return {
    availability: value.availability,
    clusterId: value.cluster.cluster_id,
    clusterProjectionRevision: value.cluster_projection_revision,
    graphRevision: value.graph_revision,
    refreshAfterSeconds: value.refresh_after_seconds,
    nodes: value.nodes.map((node) => ({
      id: node.node_id,
      kind: node.identity.kind,
      name: node.identity.name,
      status: node.status,
    })),
    edges: value.edges.map((edge) => ({
      from: edge.from_node_id,
      to: edge.to_node_id,
      type: edge.kind,
    })),
    counts: {
      filteredCount: value.counts.filtered_count,
      unfilteredCount: value.counts.unfiltered_count,
      filteredCountCompleteness: value.counts.filtered_count_completeness,
      unfilteredCountCompleteness: value.counts.unfiltered_count_completeness,
    },
    relationCompleteness: value.relation_completeness,
    partialReasonCodes: [...value.partial_reason_codes],
    truncated: value.truncated,
    omittedNodeCount: value.omitted_node_count,
    omittedEdgeCount: value.omitted_edge_count,
    snapshot: {
      snapshotRevision: value.snapshot.snapshot_revision,
      authorizationRevision: value.snapshot.authorization_revision,
      filterFingerprint: value.snapshot.filter_fingerprint,
      observedAt: value.snapshot.observed_at,
      stale: value.snapshot.stale,
      partialReasonCodes: [...value.snapshot.partial_reason_codes],
    },
  };
}

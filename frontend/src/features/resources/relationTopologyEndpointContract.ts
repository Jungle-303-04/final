import type {
  ResourcesFilterEndpointCompleteness,
  ResourcesFilterEndpointQuery,
  ResourcesFilterEndpointSnapshot,
} from "./resourcesFilterEndpointContract";

export interface RelationTopologyEndpointQuery extends ResourcesFilterEndpointQuery {
  snapshotRevision?: number;
}

/**
 * Feature-facing DTO.  The API module validates the wire payload with Zod;
 * feature code depends on this stable contract through app/apiComposition.
 */
export interface RelationTopologyEndpointResponse {
  view: "relations";
  availability: "available" | "unavailable";
  refresh_after_seconds: number;
  graph_revision: string;
  cluster_projection_revision: number;
  cluster: {
    cluster_id: string;
    name: string | null;
    provider: string | null;
  };
  nodes: RelationTopologyEndpointNode[];
  edges: RelationTopologyEndpointEdge[];
  root_node_ids: string[];
  counts: RelationTopologyEndpointCounts;
  node_count: number;
  edge_count: number;
  omitted_node_count: number;
  omitted_edge_count: number;
  node_limit: number;
  edge_limit: number;
  truncated: boolean;
  relation_completeness: ResourcesFilterEndpointCompleteness;
  partial_reason_codes: string[];
  snapshot: ResourcesFilterEndpointSnapshot;
}

export interface RelationTopologyEndpointNode {
  node_id: string;
  category: "workload" | "pod" | "node" | "service" | "endpoint" | "event" | "other";
  identity: {
    version: "v1";
    cluster_id: string;
    resource_type: string;
    api_version: string;
    kind: string;
    namespace: string | null;
    name: string;
    uid: string | null;
  };
  status: string;
  health: string;
  observed_at: string | null;
  deleted_at: string | null;
  application_ids: string[];
  application_binding_completeness: ResourcesFilterEndpointCompleteness;
}

export interface RelationTopologyEndpointEdge {
  edge_id: string;
  from_node_id: string;
  to_node_id: string;
  kind: "owns" | "runs_on" | "selects" | "routes_to";
  plane: "ownership" | "placement" | "network_configured" | "network_effective";
  direction: "directed";
  state: "active" | "historical";
  evidence: {
    type: "owner_reference" | "node_assignment" | "selector_match" | "service_name_label";
    authority: "authoritative" | "derived";
    observed_at: string | null;
  };
}

export interface RelationTopologyEndpointCounts {
  filtered_count: number | null;
  unfiltered_count: number | null;
  filtered_count_completeness: ResourcesFilterEndpointCompleteness;
  unfiltered_count_completeness: ResourcesFilterEndpointCompleteness;
}

export interface RelationTopologyEndpointDependencies {
  getRelationTopology(
    query: RelationTopologyEndpointQuery,
    signal?: AbortSignal,
  ): Promise<RelationTopologyEndpointResponse>;
}

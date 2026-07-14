import type { ResourcesFilterEndpointQuery } from "./resourcesFilterEndpointContract";
import type { RelationTopologyEdgeType } from "./relationTopologyContract";

export interface RelationTopologyEndpointQuery extends ResourcesFilterEndpointQuery {
  snapshotRevision?: number;
}

export interface RelationTopologyEndpointResponse {
  nodes: Array<{ id: string; kind: string; name: string; status: string }>;
  edges: Array<{ from: string; to: string; type: RelationTopologyEdgeType }>;
}

export interface RelationTopologyEndpointDependencies {
  getRelationTopology(
    query: RelationTopologyEndpointQuery,
    signal?: AbortSignal,
  ): Promise<RelationTopologyEndpointResponse>;
}

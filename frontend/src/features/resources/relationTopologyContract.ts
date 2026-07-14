import type { UnifiedFilterState } from "../filters/filterContract";

export type RelationTopologyEdgeType = "owns" | "runs_on" | "selects" | "routes_to";

export interface RelationTopologyNode {
  id: string;
  kind: string;
  name: string;
  status: string;
}

export interface RelationTopologyEdge {
  from: string;
  to: string;
  type: RelationTopologyEdgeType;
}

export interface RelationTopologySnapshot {
  nodes: RelationTopologyNode[];
  edges: RelationTopologyEdge[];
}

export interface RelationTopologyOptions {
  snapshotRevision?: number;
}

export interface RelationTopologyPort {
  loadRelationTopology(
    state: UnifiedFilterState,
    options?: RelationTopologyOptions,
    signal?: AbortSignal,
  ): Promise<RelationTopologySnapshot>;
}

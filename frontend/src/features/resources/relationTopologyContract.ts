import type { UnifiedFilterState } from "../filters/filterContract";
import type {
  ResourcesFilterCompleteness,
  ResourcesFilterCounts,
  ResourcesFilterSnapshot,
} from "./resourcesFilterContract";

export type RelationTopologyEdgeType = "owns" | "runs_on" | "selects" | "routes_to";
export type RelationTopologyAvailability = "available" | "unavailable";

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
  availability: RelationTopologyAvailability;
  clusterId: string;
  clusterProjectionRevision: number;
  graphRevision: string;
  refreshAfterSeconds: number;
  nodes: RelationTopologyNode[];
  edges: RelationTopologyEdge[];
  counts: ResourcesFilterCounts;
  relationCompleteness: ResourcesFilterCompleteness;
  partialReasonCodes: string[];
  truncated: boolean;
  omittedNodeCount: number;
  omittedEdgeCount: number;
  snapshot: ResourcesFilterSnapshot;
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

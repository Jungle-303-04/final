import type {
  HomeClusterChoice,
  HomeClusterChoices,
  HomePort,
  HomePortFailure,
} from "../home/homeContract";
import type { AsyncResourceState } from "../../shared/data/asyncResourceState";

export type ClusterScopeChoice = HomeClusterChoice;
export type ClusterScopeCollection = HomeClusterChoices;
export type ClusterScopeFailure = HomePortFailure;
export type ClusterScopePort = Pick<HomePort, "listClusterChoices">;
export type ClusterScopeCollectionState = AsyncResourceState<
  ClusterScopeCollection,
  ClusterScopeFailure
>;

export type ClusterScopeSelection =
  | { kind: "resolving"; requestedId: string | null }
  | { kind: "selected"; requestedId: string; cluster: ClusterScopeChoice; scopeKey: string }
  | { kind: "unknown"; requestedId: string }
  | { kind: "empty" }
  | { kind: "unavailable"; failure: ClusterScopeFailure };

export interface ClusterScopeValue {
  collection: ClusterScopeCollectionState;
  requestedClusterId: string | null;
  selectedCluster: ClusterScopeChoice | null;
  selectedClusterExists: boolean;
  selection: ClusterScopeSelection;
  scopeKey: string | null;
  refresh: () => void;
  selectCluster: (clusterId: string) => void;
}

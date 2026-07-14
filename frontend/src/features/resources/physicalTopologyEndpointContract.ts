import type {
  ResourcesFilterEndpointCompleteness,
  ResourcesFilterEndpointQuery,
  ResourcesFilterEndpointSnapshot,
} from "./resourcesFilterEndpointContract";

export interface PhysicalTopologyEndpointQuery extends ResourcesFilterEndpointQuery {
  snapshotRevision?: number;
}

export interface PhysicalTopologyEndpointServer {
  id: string;
  name: string;
  cpu_pct: number | null;
  mem_pct: number | null;
  status: string;
  matched_pod_count: number | null;
  total_pod_count: number | null;
  matched_pod_count_completeness: ResourcesFilterEndpointCompleteness;
  total_pod_count_completeness: ResourcesFilterEndpointCompleteness;
}

export interface PhysicalTopologyEndpointPod {
  id: string;
  name: string;
  namespace: string;
  server_id: string | null;
  usage_pct: number | null;
  cpu_mcores: number | null;
  mem_mib: number | null;
  phase: string;
  health: string;
  restarts: number;
  matches_filter: boolean;
}

export interface PhysicalTopologyEndpointResponse {
  view: "physical";
  cluster: {
    cluster_id: string;
    name: string | null;
    provider: string | null;
  };
  cluster_projection_revision: number;
  servers: PhysicalTopologyEndpointServer[];
  pods: PhysicalTopologyEndpointPod[];
  truncated: Record<string, number>;
  unassigned_truncated_count: number;
  counts: {
    filtered_count: number | null;
    unfiltered_count: number | null;
    filtered_count_completeness: ResourcesFilterEndpointCompleteness;
    unfiltered_count_completeness: ResourcesFilterEndpointCompleteness;
  };
  projection_completeness: ResourcesFilterEndpointCompleteness;
  metrics_completeness: ResourcesFilterEndpointCompleteness;
  metrics_observed_at: string | null;
  partial_reason_codes: string[];
  snapshot: ResourcesFilterEndpointSnapshot;
}

export interface PhysicalTopologyEndpointDependencies {
  getPhysicalTopology(
    query: PhysicalTopologyEndpointQuery,
    signal?: AbortSignal,
  ): Promise<PhysicalTopologyEndpointResponse>;
}

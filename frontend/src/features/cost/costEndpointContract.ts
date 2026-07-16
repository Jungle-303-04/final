export interface CostEndpointClusterScope {
  workspace_id: string;
  cluster_id: string;
  namespaces: string[];
  freshness: "live" | "stale" | "partial" | "disconnected";
}

export interface CostOverviewEndpoint {
  scope_coverage: {
    availability: "available" | "partial" | "unavailable";
    scopes: CostEndpointClusterScope[];
    observed_at: string | null;
    reason_codes: string[];
  };
  observation: {
    availability: "unavailable";
    observed_at: null;
    currency: null;
    data_window: null;
    reason_codes: string[];
  };
  summary: {
    availability: "unavailable";
    hourly_cost: null;
    monthly_projection: null;
    storage_cost: null;
    idle_cost: null;
    efficiency: null;
    savings_recommendations: null;
    reason_codes: string[];
  };
  refresh_after_seconds: number;
}

export interface CostEndpointDependencies {
  getCostOverview(
    query?: { clusterIds?: readonly string[] },
    signal?: AbortSignal,
  ): Promise<CostOverviewEndpoint>;
}

export interface CostEndpointClusterScope {
  workspace_id: string;
  cluster_id: string;
  namespaces: string[];
  freshness: "live" | "stale" | "partial" | "disconnected";
}

export type CostEndpointTimeRange = "6h" | "24h" | "7d";

export type CostEndpointTrend = {
  availability: "available" | "partial";
  range: CostEndpointTimeRange;
  currency: string;
  series: Array<{
    key: string;
    label: string;
    points: Array<{ timestamp: number; rate_micros: number }>;
  }>;
  reason_codes: string[];
} | {
  availability: "unavailable";
  range: CostEndpointTimeRange;
  currency: null;
  series: [];
  reason_codes: string[];
};

export type CostWorkloadAllocationEndpoint = {
  availability: "unavailable";
  reason_codes: string[];
} | {
  availability: "available" | "partial";
  observed_at: string;
  currency: string;
  current: {
    replicas: number;
    hourly_rate_micros: number;
    projected_daily_micros: number;
    projected_monthly_micros: number;
    cpu_rate_micros: number;
    memory_rate_micros: number;
    cpu_allocation_use_basis_points: number | null;
    memory_allocation_use_basis_points: number | null;
    cpu_usage_window_seconds: number | null;
    memory_usage_window_seconds: number | null;
  };
  trend: CostEndpointTrend;
  reason_codes: string[];
};

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
  trend: CostEndpointTrend;
  refresh_after_seconds: number;
  trend_refresh_after_seconds: number;
  nodes_refresh_after_seconds: number;
}

export interface CostEndpointDependencies {
  getCostOverview(
    query?: { clusterIds?: readonly string[]; timeRange?: CostEndpointTimeRange },
    signal?: AbortSignal,
  ): Promise<CostOverviewEndpoint>;
}

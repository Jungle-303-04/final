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
  } | {
    availability: "available" | "partial";
    observed_at: string;
    currency: string;
    data_window: string;
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
  } | {
    availability: "available" | "partial";
    hourly_cost: number;
    monthly_projection: number;
    storage_cost: number | null;
    idle_cost: number | null;
    efficiency: number | null;
    savings_recommendations: null;
    reason_codes: string[];
  };
  trend: CostEndpointTrend;
  refresh_after_seconds: number;
  trend_refresh_after_seconds: number;
  nodes_refresh_after_seconds: number;
}

export interface CostNodePageEndpoint {
  scope_coverage: CostOverviewEndpoint["scope_coverage"];
  items: Array<{
    resource: {
      api_group: string;
      version: string;
      kind: "Node";
      namespace: null;
      name: string;
      uid: string;
    };
    cluster_id: string;
    cluster_name: string;
    provider: string;
    provider_id: string | null;
    instance_type: string | null;
    zone: string | null;
    capacity_type: string | null;
    status: string;
    observed_at: string;
    capacity: { cpu_mcores: number | null; memory_mib: number | null; pods: number | null };
    usage: {
      availability: "available" | "partial" | "unavailable";
      observed_at: string | null;
      cpu_mcores: number | null;
      memory_mib: number | null;
      cpu_utilization_percent: number | null;
      memory_utilization_percent: number | null;
      reason_codes: string[];
    };
    pricing: {
      availability: "unavailable";
      currency: null;
      hourly_rate_micros: null;
      reason_codes: string[];
    };
  }>;
  total: number;
  count_completeness: "exact" | "partial" | "unavailable";
  has_more: boolean;
  next_cursor: string | null;
  snapshot_revision: number;
  pricing_coverage: { availability: "unavailable"; reason_codes: string[] };
  refresh_after_seconds: number;
}

export interface CostEndpointDependencies {
  getCostOverview(
    query?: {
      clusterIds?: readonly string[];
      namespaces?: readonly string[];
      timeRange?: CostEndpointTimeRange;
    },
    signal?: AbortSignal,
  ): Promise<CostOverviewEndpoint>;
  getCostNodes(
    query?: {
      clusterIds?: readonly string[];
      namespaces?: readonly string[];
      cursor?: string;
      limit?: number;
    },
    signal?: AbortSignal,
  ): Promise<CostNodePageEndpoint>;
}

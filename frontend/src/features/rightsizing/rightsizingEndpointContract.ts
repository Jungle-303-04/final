export type RightsizingAvailabilityEndpoint = "available" | "partial" | "unavailable";
export type RightsizingActionEndpoint =
  | "increase"
  | "reduction"
  | "review"
  | "in_range"
  | "need_data";

export interface RightsizingQuantityEndpoint {
  unit: "millicores" | "bytes";
  value: number;
}

export interface RightsizingProvenanceEndpoint {
  collector: string;
  algorithm_revision: string;
  source_revision: string;
  window_started_at: string;
  window_ended_at: string;
  sample_interval_seconds: number;
}

export interface RightsizingMetricEndpoint {
  container: string;
  resource: "cpu" | "memory";
  fit: "balanced" | "oversized" | "under_requested" | "missing_request" | "insufficient_history";
  action: RightsizingActionEndpoint;
  confidence: "high" | "medium" | "low" | "none";
  current_request: RightsizingQuantityEndpoint | null;
  observed_demand: RightsizingQuantityEndpoint | null;
  recommended_request: RightsizingQuantityEndpoint | null;
  sample_count: number;
  expected_samples: number;
  coverage_basis_points: number;
  signals: Array<"hpa" | "oom" | "bursty" | "throttling" | "query_error" | "history_incomplete">;
  reason_codes: string[];
}

export interface RightsizingObservedWorkloadEndpoint {
  availability: "available" | "partial";
  resource: {
    api_group: string;
    version: string;
    kind: string;
    namespace: string | null;
    name: string;
    uid: string;
  };
  observed_at: string;
  freshness: "live" | "stale" | "partial" | "disconnected";
  provenance: RightsizingProvenanceEndpoint;
  replicas: number;
  scaled_to_zero: boolean;
  classification: RightsizingActionEndpoint;
  impact: {
    replicas: number;
    cpu_millicores_change: number;
    memory_bytes_change: number;
  };
  rows: RightsizingMetricEndpoint[];
  reason_codes: string[];
}

export type RightsizingWorkloadEvidenceEndpoint =
  | RightsizingObservedWorkloadEndpoint
  | { availability: "unavailable"; reason_codes: string[] };

export interface RightsizingScanEndpoint {
  scope: {
    workspace_id: string;
    cluster_id: string;
    namespaces: string[];
    freshness: "live" | "stale" | "partial" | "disconnected";
  };
  namespace_scope: string[];
  result: {
    availability: "unavailable";
    reason_codes: string[];
  } | {
    availability: "available" | "partial";
    observed_at: string;
    provenance: RightsizingProvenanceEndpoint;
    coverage: {
      workloads_discovered: number;
      workloads_evaluated: number;
      workloads_with_data: number;
      truncated: boolean;
    };
    workloads: RightsizingObservedWorkloadEndpoint[];
    failures: Array<{
      resource: RightsizingObservedWorkloadEndpoint["resource"] | null;
      reason_code: string;
    }>;
    reason_codes: string[];
  };
  refresh_after_seconds: number;
}

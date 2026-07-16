import type { ResourcesFilterEndpointQuery } from "./resourcesFilterEndpointContract";

type Completeness = "exact" | "partial" | "unavailable";

export interface ResourceMetricsHistoryEndpointQuery extends ResourcesFilterEndpointQuery {
  ids: string[];
  snapshotRevision: number;
  range?: "15m" | "1h" | "6h" | "24h";
  limit?: number;
}

export interface ResourceMetricsHistoryEndpointResponse {
  refresh_policy_key:
    | "metrics_kubernetes"
    | "metrics_prometheus"
    | "metrics_pvc"
    | "metrics_rightsizing";
  series: Array<{
    resource_id: string;
    cluster_id: string;
    resource_type: "pod" | "node";
    namespace: string | null;
    name: string;
    points: Array<{
      observed_at: string;
      cpu_mcores: number | null;
      mem_mib: number | null;
    }>;
    has_sparkline_points: boolean;
    completeness: Completeness;
    partial_reason_codes: string[];
  }>;
  completeness: Completeness;
  partial_reason_codes: string[];
  snapshot: {
    snapshot_revision: number;
    authorization_revision: string;
    filter_fingerprint: string;
    observed_at: string | null;
    stale: boolean;
    partial_reason_codes: string[];
  };
}

export interface ResourceMetricsHistoryEndpointDependencies {
  getResourceMetricsHistory(
    query: ResourceMetricsHistoryEndpointQuery,
    signal?: AbortSignal,
  ): Promise<ResourceMetricsHistoryEndpointResponse>;
  runScopedMetricQuery?(
    request: ScopedMetricEndpointRequest,
    options?: { signal?: AbortSignal },
  ): Promise<ScopedMetricEndpointRun>;
}

type ScopedMetricCategory =
  | "cpu"
  | "memory"
  | "network_rx"
  | "network_tx"
  | "filesystem"
  | "restarts"
  | "volume_usage";

export interface ScopedMetricEndpointRequest {
  cluster_id: string;
  subject:
    | { kind: "resource"; resource_id: string }
    | { kind: "pvc"; resource_id: string }
    | { kind: "namespace"; namespace: string }
    | { kind: "cluster" };
  categories: ScopedMetricCategory[];
  range: "15m" | "1h" | "6h" | "24h";
}

export interface ScopedMetricEndpointRun {
  endpoint: {
    refresh_policy_key: "metrics_prometheus" | "metrics_pvc";
    scope: { cluster_id: string };
    resource: {
      kind: string;
      namespace: string | null;
      name: string;
    } | null;
  };
  completeness: "exact" | "partial" | "unavailable";
  reasonCodes: string[];
  observations: Array<{
    category: ScopedMetricCategory;
    result: {
      series: Array<{
        values: Array<{ timestamp: number | null; value: number | null }>;
      }>;
    };
  }>;
}

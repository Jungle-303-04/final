import type {
  TrafficAvailability,
  TrafficFreshness,
  TrafficProtocol,
  TrafficSince,
  TrafficSort,
  TrafficSortOrder,
  TrafficVerdict,
} from "./trafficContract";

export interface TrafficOverviewQuery {
  clusterIds?: readonly string[];
  namespaces?: readonly string[];
  since?: TrafficSince;
  protocols?: readonly TrafficProtocol[];
  verdicts?: readonly TrafficVerdict[];
  sort?: TrafficSort;
  order?: TrafficSortOrder;
  cursor?: string;
  limit?: number;
}

export interface TrafficSourcesQuery {
  clusterIds?: readonly string[];
}

export interface TrafficSourceCommandPayload {
  scope: Omit<TrafficClusterScopeEndpoint, "namespaces"> & { namespaces: readonly string[] };
  source_key: string;
  capability_revision: string;
  confirmation: true;
  reason: string;
}

export interface TrafficClusterScopeEndpoint {
  workspace_id: string;
  cluster_id: string;
  namespaces: string[];
  freshness: TrafficFreshness;
}

export interface TrafficScopeCoverageEndpoint {
  availability: TrafficAvailability;
  scopes: TrafficClusterScopeEndpoint[];
  observed_at: string | null;
  reason_codes: string[];
}

interface TrafficUnavailableObservationEndpoint {
  availability: "unavailable";
  observed_at: null;
  reason_codes: string[];
}

interface TrafficObservedObservationEndpoint {
  availability: "available" | "partial";
  observed_at: string;
  since: TrafficSince;
  source_keys: string[];
  reason_codes: string[];
}

interface TrafficUnavailableSummaryEndpoint {
  availability: "unavailable";
  total_flow_count: null;
  denied_flow_count: null;
  external_flow_count: null;
  reason_codes: string[];
}

interface TrafficObservedSummaryEndpoint {
  availability: "available" | "partial";
  total_flow_count: number;
  denied_flow_count: number;
  external_flow_count: number;
  reason_codes: string[];
}

export interface TrafficEndpointEndpoint {
  cluster_id: string;
  name: string;
  namespace: string | null;
  kind: string;
  workload: string | null;
  service: string | null;
  ip: string | null;
  identity_stability: "provider_observed";
}

export interface TrafficRelationshipEndpoint {
  flow_id: string;
  source_key: string;
  source: TrafficEndpointEndpoint;
  target: TrafficEndpointEndpoint;
  protocol: TrafficProtocol;
  port: number | null;
  verdict: TrafficVerdict;
  connections: number;
  bytes_sent: number | null;
  bytes_received: number | null;
  observed_at: string;
}

export interface TrafficServiceMetricEndpoint {
  availability: TrafficAvailability;
  cluster_id: string;
  namespace: string | null;
  service: string;
  rate_per_second: number | null;
  rate_unit: "requests" | "flows" | null;
  error_rate_pct: number | null;
  observed_at: string;
  source_keys: string[];
  reason_codes: string[];
}

interface TrafficUnavailableRelationshipsEndpoint {
  availability: "unavailable";
  edges: null;
  reason_codes: string[];
}

interface TrafficObservedRelationshipsEndpoint {
  availability: "available" | "partial";
  edges: TrafficRelationshipEndpoint[];
  total_count: number;
  has_more: boolean;
  next_cursor: string | null;
  facets: {
    protocols: Array<{ value: TrafficProtocol; count: number }>;
    verdicts: Array<{ value: TrafficVerdict; count: number }>;
  };
  reason_codes: string[];
}

export interface TrafficOverviewEndpoint {
  scope_coverage: TrafficScopeCoverageEndpoint;
  observation: TrafficObservedObservationEndpoint | TrafficUnavailableObservationEndpoint;
  summary: TrafficObservedSummaryEndpoint | TrafficUnavailableSummaryEndpoint;
  relationships: TrafficObservedRelationshipsEndpoint | TrafficUnavailableRelationshipsEndpoint;
  service_metrics: TrafficServiceMetricEndpoint[];
  refresh_after_seconds: number;
}

export interface TrafficSourceActionEndpoint {
  id: string;
  kind: "select" | "connect";
  label: string;
  enabled: boolean;
  confirmation_required: boolean;
  reason_code: string | null;
}

export interface TrafficSourceEndpoint {
  key: string;
  label: string;
  status: "available" | "not_detected" | "error";
  version: string | null;
  native: boolean;
  message: string;
  actions: TrafficSourceActionEndpoint[];
}

export interface TrafficSourcesEndpoint {
  availability: TrafficAvailability;
  coverage: TrafficScopeCoverageEndpoint;
  clusters: Array<{
    scope: TrafficClusterScopeEndpoint;
    freshness: TrafficFreshness;
    observed_at: string | null;
    active_source: string | null;
    capability_revision: string;
    cluster: {
      platform: string;
      cni: string;
      dataplane_v2: boolean;
      kubernetes_version: string | null;
    } | null;
    sources: TrafficSourceEndpoint[];
    reason_codes: string[];
  }>;
  reason_codes: string[];
}

export interface TrafficCommandReceiptEndpoint {
  accepted: true;
  event_id: string;
  audit_event_id: string;
  command_id: string;
  correlation_id: string;
  status: "queued" | "leased" | "running" | "cancel_requested" | "cancelling" | "completed" | "failed" | "cancelled";
}

export interface TrafficEndpointDependencies {
  getTrafficOverview(
    query: TrafficOverviewQuery,
    signal?: AbortSignal,
  ): Promise<TrafficOverviewEndpoint>;
  getTrafficSources(
    query: TrafficSourcesQuery,
    signal?: AbortSignal,
  ): Promise<TrafficSourcesEndpoint>;
  setTrafficSource(
    payload: TrafficSourceCommandPayload,
    idempotencyKey: string,
    signal?: AbortSignal,
  ): Promise<TrafficCommandReceiptEndpoint>;
  connectTrafficSource(
    payload: TrafficSourceCommandPayload,
    idempotencyKey: string,
    signal?: AbortSignal,
  ): Promise<TrafficCommandReceiptEndpoint>;
}

export interface TrafficEndpointClusterScope {
  workspace_id: string;
  cluster_id: string;
  namespaces: string[];
  freshness: "live" | "stale" | "partial" | "disconnected";
}

export interface TrafficOverviewEndpoint {
  scope_coverage: {
    availability: "available" | "partial" | "unavailable";
    scopes: TrafficEndpointClusterScope[];
    observed_at: string | null;
    reason_codes: string[];
  };
  observation: {
    availability: "unavailable";
    observed_at: null;
    reason_codes: string[];
  };
  summary: {
    availability: "unavailable";
    total_flow_count: null;
    denied_flow_count: null;
    external_flow_count: null;
    reason_codes: string[];
  };
  relationships: {
    availability: "unavailable";
    edges: null;
    reason_codes: string[];
  };
}

export interface TrafficEndpointDependencies {
  getTrafficOverview(
    query: { clusterIds?: readonly string[]; namespaces?: readonly string[] },
    signal?: AbortSignal,
  ): Promise<TrafficOverviewEndpoint>;
  getTrafficSources(
    query: { clusterIds?: readonly string[] },
    signal?: AbortSignal,
  ): Promise<import("../../api/traffic-control-schemas").TrafficSourcesEndpoint>;
  setTrafficSource(
    payload: import("../../api/traffic-control").TrafficSourceCommandPayload,
    idempotencyKey: string,
    signal?: AbortSignal,
  ): Promise<import("../../api/traffic-control-schemas").TrafficCommandReceiptEndpoint>;
  connectTrafficSource(
    payload: import("../../api/traffic-control").TrafficSourceCommandPayload,
    idempotencyKey: string,
    signal?: AbortSignal,
  ): Promise<import("../../api/traffic-control-schemas").TrafficCommandReceiptEndpoint>;
}

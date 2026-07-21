// Hand-written wire-shape contract for the traffic overview endpoint.
//
// This file must NOT import from `../../api` (enforced by apiBoundary.test.ts): feature
// modules are decoupled from the api client and its zod schemas. The interfaces below are
// hand-maintained to be STRUCTURALLY IDENTICAL to the inferred output of
// `trafficOverviewSchema` in src/api/traffic-overview-schemas.ts (snake_case wire fields,
// observed + unavailable unions) and to the `TrafficOverviewQuery` accepted by
// `getTrafficOverview` in src/api/traffic-overview.ts. Keep them in sync with that schema.

// --- Literal aliases (mirror packages.contracts.traffic.observations) ---
type WireTrafficAvailability = "available" | "partial" | "unavailable";
type WireTrafficFreshness = "live" | "stale" | "partial" | "disconnected";
type WireTrafficSince = "1m" | "5m" | "15m" | "1h";
type WireTrafficSort = "connections" | "last_seen" | "source" | "destination";
type WireTrafficSortOrder = "asc" | "desc";
type WireTrafficProtocol = "tcp" | "udp" | "http" | "grpc" | "dns" | "unknown";
type WireTrafficVerdict = "forwarded" | "dropped" | "error" | "unknown";

interface WireTrafficClusterScope {
  workspace_id: string;
  cluster_id: string;
  namespaces: string[];
  freshness: WireTrafficFreshness;
}

interface WireTrafficScopeCoverage {
  availability: WireTrafficAvailability;
  scopes: WireTrafficClusterScope[];
  observed_at: string | null;
  reason_codes: string[];
}

interface WireTrafficObservedObservationStatus {
  availability: "available" | "partial";
  observed_at: string;
  since: WireTrafficSince;
  source_keys: string[];
  reason_codes: string[];
}

interface WireTrafficObservationStatus {
  availability: "unavailable";
  observed_at: null;
  reason_codes: string[];
}

interface WireTrafficObservedObservationSummary {
  availability: "available" | "partial";
  total_flow_count: number;
  denied_flow_count: number;
  external_flow_count: number;
  reason_codes: string[];
}

interface WireTrafficObservationSummary {
  availability: "unavailable";
  total_flow_count: null;
  denied_flow_count: null;
  external_flow_count: null;
  reason_codes: string[];
}

interface WireTrafficEndpoint {
  cluster_id: string;
  name: string;
  namespace: string | null;
  kind: string;
  workload: string | null;
  service: string | null;
  ip: string | null;
  identity_stability: "provider_observed";
}

interface WireTrafficRelationship {
  flow_id: string;
  source_key: string;
  source: WireTrafficEndpoint;
  target: WireTrafficEndpoint;
  protocol: WireTrafficProtocol;
  port: number | null;
  verdict: WireTrafficVerdict;
  connections: number;
  bytes_sent: number | null;
  bytes_received: number | null;
  observed_at: string;
}

interface WireTrafficProtocolFacet {
  value: WireTrafficProtocol;
  count: number;
}

interface WireTrafficVerdictFacet {
  value: WireTrafficVerdict;
  count: number;
}

interface WireTrafficFlowFacets {
  protocols: WireTrafficProtocolFacet[];
  verdicts: WireTrafficVerdictFacet[];
}

interface WireTrafficObservedRelationships {
  availability: "available" | "partial";
  edges: WireTrafficRelationship[];
  total_count: number;
  has_more: boolean;
  next_cursor: string | null;
  facets: WireTrafficFlowFacets;
  reason_codes: string[];
}

interface WireTrafficRelationships {
  availability: "unavailable";
  edges: null;
  reason_codes: string[];
}

export interface TrafficOverviewEndpoint {
  scope_coverage: WireTrafficScopeCoverage;
  observation: WireTrafficObservedObservationStatus | WireTrafficObservationStatus;
  summary: WireTrafficObservedObservationSummary | WireTrafficObservationSummary;
  relationships: WireTrafficObservedRelationships | WireTrafficRelationships;
  refresh_after_seconds: number;
}

export interface TrafficOverviewEndpointQuery {
  clusterIds?: readonly string[];
  namespaces?: readonly string[];
  since?: WireTrafficSince;
  protocols?: readonly WireTrafficProtocol[];
  verdicts?: readonly WireTrafficVerdict[];
  sort?: WireTrafficSort;
  order?: WireTrafficSortOrder;
  cursor?: string;
  limit?: number;
}

export interface TrafficEndpointDependencies {
  getTrafficOverview(
    query: TrafficOverviewEndpointQuery,
    signal?: AbortSignal,
  ): Promise<TrafficOverviewEndpoint>;
}

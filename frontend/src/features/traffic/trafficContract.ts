import type { CommandReceipt } from "../../shared/parity/referenceParity";

export type TrafficAvailability = "available" | "partial" | "unavailable";
export type TrafficFreshness = "live" | "stale" | "partial" | "disconnected";
export type TrafficSince = "1m" | "5m" | "15m" | "1h";
export type TrafficSort = "connections" | "last_seen" | "source" | "destination";
export type TrafficSortOrder = "asc" | "desc";
export type TrafficProtocol = "tcp" | "udp" | "http" | "grpc" | "dns" | "unknown";
export type TrafficVerdict = "forwarded" | "dropped" | "error" | "unknown";

export interface TrafficClusterScope {
  workspaceId: string;
  clusterId: string;
  namespaces: readonly string[];
  freshness: TrafficFreshness;
}

export interface TrafficScopeCoverage {
  availability: TrafficAvailability;
  scopes: readonly TrafficClusterScope[];
  observedAt: string | null;
  reasonCodes: readonly string[];
}

export interface TrafficUnavailableObservation {
  availability: "unavailable";
  observedAt: null;
  reasonCodes: readonly string[];
}

export interface TrafficObservedObservation {
  availability: "available" | "partial";
  observedAt: string;
  since: TrafficSince;
  sourceKeys: readonly string[];
  reasonCodes: readonly string[];
}

export interface TrafficUnavailableSummary {
  availability: "unavailable";
  totalFlowCount: null;
  deniedFlowCount: null;
  externalFlowCount: null;
  reasonCodes: readonly string[];
}

export interface TrafficObservedSummary {
  availability: "available" | "partial";
  totalFlowCount: number;
  deniedFlowCount: number;
  externalFlowCount: number;
  reasonCodes: readonly string[];
}

export interface TrafficEndpoint {
  clusterId: string;
  name: string;
  namespace: string | null;
  kind: string;
  workload: string | null;
  service: string | null;
  ip: string | null;
  identityStability: "provider_observed";
}

export interface TrafficRelationship {
  flowId: string;
  sourceKey: string;
  source: TrafficEndpoint;
  target: TrafficEndpoint;
  protocol: TrafficProtocol;
  port: number | null;
  verdict: TrafficVerdict;
  connections: number;
  bytesSent: number | null;
  bytesReceived: number | null;
  observedAt: string;
}

export interface TrafficUnavailableRelationships {
  availability: "unavailable";
  edges: null;
  reasonCodes: readonly string[];
}

export interface TrafficObservedRelationships {
  availability: "available" | "partial";
  edges: readonly TrafficRelationship[];
  totalCount: number;
  hasMore: boolean;
  nextCursor: string | null;
  facets: {
    protocols: readonly { value: TrafficProtocol; count: number }[];
    verdicts: readonly { value: TrafficVerdict; count: number }[];
  };
  reasonCodes: readonly string[];
}

export interface TrafficOverview {
  scopeCoverage: TrafficScopeCoverage;
  observation: TrafficObservedObservation | TrafficUnavailableObservation;
  summary: TrafficObservedSummary | TrafficUnavailableSummary;
  relationships: TrafficObservedRelationships | TrafficUnavailableRelationships;
  refreshAfterSeconds: number;
}

export interface TrafficOverviewRequest {
  clusterIds: readonly string[];
  namespaces: readonly string[];
  since?: TrafficSince;
  protocols?: readonly TrafficProtocol[];
  verdicts?: readonly TrafficVerdict[];
  sort?: TrafficSort;
  order?: TrafficSortOrder;
  cursor?: string;
  limit?: number;
}

export interface TrafficSourceActionDescriptor {
  id: string;
  kind: "select" | "connect";
  label: string;
  enabled: boolean;
  confirmationRequired: boolean;
  reasonCode: string | null;
}

export interface TrafficSourceDescriptor {
  key: string;
  label: string;
  status: "available" | "not_detected" | "error";
  version: string | null;
  native: boolean;
  message: string;
  actions: readonly TrafficSourceActionDescriptor[];
}

export interface TrafficDetectedCluster {
  platform: string;
  cni: string;
  dataplaneV2: boolean;
  kubernetesVersion: string | null;
}

export interface TrafficClusterSourceCatalog {
  scope: TrafficClusterScope;
  freshness: TrafficFreshness;
  observedAt: string | null;
  activeSource: string | null;
  capabilityRevision: string;
  cluster: TrafficDetectedCluster | null;
  sources: readonly TrafficSourceDescriptor[];
  reasonCodes: readonly string[];
}

export interface TrafficSources {
  availability: TrafficAvailability;
  coverage: TrafficScopeCoverage;
  clusters: readonly TrafficClusterSourceCatalog[];
  reasonCodes: readonly string[];
}

export interface TrafficSourceCommandInput {
  scope: TrafficClusterScope;
  sourceKey: string;
  capabilityRevision: string;
  confirmation: true;
  idempotencyKey: string;
  reason: string;
}

export type TrafficFailureCode =
  | "unauthorized"
  | "forbidden"
  | "invalid-request"
  | "invalid-response"
  | "not-found"
  | "offline"
  | "rate-limited"
  | "error";

export class TrafficPortFailure extends Error {
  readonly code: TrafficFailureCode;
  readonly retryAfterSeconds: number | null;

  constructor(code: TrafficFailureCode, retryAfterSeconds: number | null = null) {
    super(`Traffic port failed: ${code}`);
    this.name = "TrafficPortFailure";
    this.code = code;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export interface TrafficPort {
  getOverview(request: TrafficOverviewRequest, signal?: AbortSignal): Promise<TrafficOverview>;
  getSources(
    request: Pick<TrafficOverviewRequest, "clusterIds">,
    signal?: AbortSignal,
  ): Promise<TrafficSources>;
  selectSource(input: TrafficSourceCommandInput, signal?: AbortSignal): Promise<CommandReceipt>;
  connectSource(input: TrafficSourceCommandInput, signal?: AbortSignal): Promise<CommandReceipt>;
}

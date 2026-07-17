import type { CommandReceipt } from "../../shared/parity/referenceParity";

export type TrafficAvailability = "available" | "partial" | "unavailable";
export type TrafficFreshness = "live" | "stale" | "partial" | "disconnected";

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

export interface TrafficUnavailableSummary {
  availability: "unavailable";
  totalFlowCount: null;
  deniedFlowCount: null;
  externalFlowCount: null;
  reasonCodes: readonly string[];
}

export interface TrafficUnavailableRelationships {
  availability: "unavailable";
  edges: null;
  reasonCodes: readonly string[];
}

export interface TrafficOverview {
  scopeCoverage: TrafficScopeCoverage;
  observation: TrafficUnavailableObservation;
  summary: TrafficUnavailableSummary;
  relationships: TrafficUnavailableRelationships;
}

export interface TrafficOverviewRequest {
  clusterIds: readonly string[];
  namespaces: readonly string[];
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

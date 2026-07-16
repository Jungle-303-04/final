export type WorkloadDetailAvailability = "available" | "partial" | "unavailable";
export type WorkloadDetailFreshness = "live" | "stale" | "partial" | "disconnected";
export type WorkloadLogStreamKind = "deployments" | "statefulsets" | "daemonsets";
export type WorkloadDetailTab = "overview" | "pods" | "events" | "logs";

export interface WorkloadDetailResourceRef {
  apiGroup: string;
  version: string;
  kind: string;
  namespace: string | null;
  name: string;
  uid: string;
}

export interface WorkloadDetailScope {
  workspaceId: string;
  clusterId: string;
  namespaces: readonly string[];
  freshness: WorkloadDetailFreshness;
}

export interface WorkloadDetailCoverage {
  availability: WorkloadDetailAvailability;
  observationSnapshotId: string;
  latestSnapshotId: string;
  observedAt: string | null;
  reasonCodes: readonly string[];
}

export interface WorkloadDetailFeature {
  name: string;
  availability: WorkloadDetailAvailability;
  reasonCodes: readonly string[];
}

export interface WorkloadLogStreamCapability {
  availability: WorkloadDetailAvailability;
  streamKind: WorkloadLogStreamKind | null;
  reasonCodes: readonly string[];
}

export interface WorkloadReplicaObservation {
  desired: number | null;
  ready: number | null;
  available: number | null;
  updated: number | null;
  unavailable: number | null;
}

export interface WorkloadDetailObservation {
  resource: WorkloadDetailResourceRef;
  health: string;
  replicas: WorkloadReplicaObservation;
  labels: readonly { key: string; value: string }[];
  observedAt: string | null;
}

export interface WorkloadPodObservation {
  resource: WorkloadDetailResourceRef;
  health: string;
  observedAt: string | null;
}

export interface WorkloadEventObservation {
  resource: WorkloadDetailResourceRef;
  eventType: string | null;
  reason: string | null;
  occurrenceCount: number | null;
  lastOccurredAt: string | null;
}

export interface WorkloadDetail {
  scope: WorkloadDetailScope;
  observation: WorkloadDetailObservation;
  coverage: WorkloadDetailCoverage;
  pods: {
    availability: WorkloadDetailAvailability;
    items: readonly WorkloadPodObservation[];
    excludedCount: number;
    reasonCodes: readonly string[];
  };
  events: {
    availability: WorkloadDetailAvailability;
    items: readonly WorkloadEventObservation[];
    excludedCount: number;
    reasonCodes: readonly string[];
  };
  logStream: WorkloadLogStreamCapability;
  capabilities: {
    revision: string;
    actions: readonly string[];
  };
  features: readonly WorkloadDetailFeature[];
}

export interface WorkloadDetailRequest {
  clusterId: string;
  apiGroup: string;
  apiVersion: string;
  kind: string;
  namespace: string | null;
  name: string;
}

export type WorkloadDetailFailureCode =
  | "unauthorized"
  | "forbidden"
  | "not-found"
  | "identity-incomplete"
  | "unavailable"
  | "invalid-request"
  | "invalid-response"
  | "offline"
  | "rate-limited"
  | "error";

export class WorkloadDetailPortFailure extends Error {
  constructor(readonly code: WorkloadDetailFailureCode) {
    super(`Workload Detail port failed: ${code}`);
    this.name = "WorkloadDetailPortFailure";
  }
}

export interface WorkloadDetailPort {
  getDetail(request: WorkloadDetailRequest, signal?: AbortSignal): Promise<WorkloadDetail>;
}

export const EMPTY_WORKLOAD_DETAIL_PORT: WorkloadDetailPort = {
  async getDetail() {
    throw new WorkloadDetailPortFailure("unavailable");
  },
};

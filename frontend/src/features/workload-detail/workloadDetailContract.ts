import type { RightsizingWorkloadEvidence } from "../rightsizing/rightsizingContract";

export type WorkloadDetailAvailability = "available" | "partial" | "unavailable";
export type WorkloadDetailFreshness = "live" | "stale" | "partial" | "disconnected";
export type WorkloadLogStreamKind = "deployments" | "statefulsets" | "daemonsets";
export type WorkloadDetailTab = "overview" | "pods" | "events" | "logs" | "execution";

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
  rightsizing: RightsizingWorkloadEvidence;
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

export interface ScheduledRunLifecycleEvent {
  eventId: string;
  runKey: string;
  resource: WorkloadDetailResourceRef;
  stage: "scheduled" | "started" | "finished";
  occurredAt: string;
  eventType: "normal" | "warning";
  reason: string;
}

export interface ScheduledWorkloadRun {
  runKey: string;
  resource: WorkloadDetailResourceRef;
  phase: "pending" | "running" | "succeeded" | "failed" | "unknown";
  active: boolean;
  scheduledAt: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  desired: number | null;
  succeeded: number | null;
  failed: number | null;
  podTotal: number;
  podSucceeded: number;
  podFailed: number;
  podRunning: number;
  nextStep: "logs" | "timeline" | null;
  observedAt: string | null;
}

export interface ScheduledRunCatalog {
  scope: WorkloadDetailScope;
  owner: WorkloadDetailResourceRef;
  runs: readonly ScheduledWorkloadRun[];
  lifecycle: readonly ScheduledRunLifecycleEvent[];
  defaultRunKey: string | null;
  complete: boolean;
  reasonCodes: readonly string[];
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
  getScheduledRuns(request: WorkloadDetailRequest, signal?: AbortSignal): Promise<ScheduledRunCatalog>;
}

export const EMPTY_WORKLOAD_DETAIL_PORT: WorkloadDetailPort = {
  async getDetail() {
    throw new WorkloadDetailPortFailure("unavailable");
  },
  async getScheduledRuns() {
    throw new WorkloadDetailPortFailure("unavailable");
  },
};

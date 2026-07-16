import type { RightsizingWorkloadEvidenceEndpoint } from "../rightsizing/rightsizingEndpointContract";

/**
 * API-validated transport shape for the Workload Detail feature. The API
 * layer owns Zod validation; the feature owns this narrow mapping contract.
 */
export type WorkloadDetailWireAvailability = "available" | "partial" | "unavailable";
export type WorkloadDetailWireFreshness = "live" | "stale" | "partial" | "disconnected";

export interface WorkloadDetailWireResourceRef {
  api_group: string;
  version: string;
  kind: string;
  namespace: string | null;
  name: string;
  uid: string;
}

export interface WorkloadDetailWireScope {
  workspace_id: string;
  cluster_id: string;
  namespaces: string[];
  freshness: WorkloadDetailWireFreshness;
}

export interface ScheduledRunCatalogEndpoint {
  scope: WorkloadDetailWireScope;
  owner: WorkloadDetailWireResourceRef;
  runs: {
    run_key: string;
    resource: WorkloadDetailWireResourceRef;
    phase: "pending" | "running" | "succeeded" | "failed" | "unknown";
    active: boolean;
    scheduled_at: string | null;
    started_at: string | null;
    finished_at: string | null;
    desired: number | null;
    succeeded: number | null;
    failed: number | null;
    pod_total: number;
    pod_succeeded: number;
    pod_failed: number;
    pod_running: number;
    next_step: "logs" | "timeline" | null;
    observed_at: string | null;
  }[];
  lifecycle: {
    event_id: string;
    run_key: string;
    resource: WorkloadDetailWireResourceRef;
    stage: "scheduled" | "started" | "finished";
    occurred_at: string;
    event_type: "normal" | "warning";
    reason: string;
  }[];
  default_run_key: string | null;
  complete: boolean;
  reason_codes: string[];
}

interface WorkloadDetailWireObservedResource {
  resource: WorkloadDetailWireResourceRef;
  observed_at: string | null;
}

export interface WorkloadDetailEndpoint {
  detail: {
    scope: WorkloadDetailWireScope;
    observation: {
      resource: WorkloadDetailWireResourceRef;
      health: string;
      replicas: {
        desired: number | null;
        ready: number | null;
        available: number | null;
        updated: number | null;
        unavailable: number | null;
      };
      labels: { key: string; value: string }[];
      observed_at: string | null;
    };
    coverage: {
      availability: WorkloadDetailWireAvailability;
      observation_snapshot_id: string;
      latest_snapshot_id: string;
      observed_at: string | null;
      reason_codes: string[];
    };
    pods: {
      availability: WorkloadDetailWireAvailability;
      items: (WorkloadDetailWireObservedResource & { health: string })[];
      excluded_count: number;
      reason_codes: string[];
    };
    events: {
      availability: WorkloadDetailWireAvailability;
      items: {
        resource: WorkloadDetailWireResourceRef;
        event_type: string | null;
        reason: string | null;
        occurrence_count: number | null;
        last_occurred_at: string | null;
      }[];
      excluded_count: number;
      reason_codes: string[];
    };
    log_stream: {
      availability: WorkloadDetailWireAvailability;
      stream_kind: "deployments" | "statefulsets" | "daemonsets" | null;
      reason_codes: string[];
    };
    rightsizing: RightsizingWorkloadEvidenceEndpoint;
    capabilities: {
      scope: WorkloadDetailWireScope;
      resource: WorkloadDetailWireResourceRef;
      revision: string;
      actions: string[];
    };
    features: {
      name: string;
      availability: WorkloadDetailWireAvailability;
      reason_codes: string[];
    }[];
  };
}

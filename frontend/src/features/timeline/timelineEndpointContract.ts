export interface TimelineEndpointScope {
  workspace_id: string;
  cluster_id: string;
  namespaces: string[];
  freshness: "live" | "stale" | "partial" | "disconnected";
}

export interface TimelineEndpointResourceRef {
  api_group: string;
  version: string;
  kind: string;
  namespace: string | null;
  name: string;
  uid: string;
}

export type TimelineEndpointSubject =
  | { kind: "resource"; resource: TimelineEndpointResourceRef }
  | {
    kind: "inventory_locator";
    inventory_key: string;
    api_group: string;
    version: string;
    resource_kind: string;
    namespace: string | null;
    name: string;
  }
  | { kind: "incident"; incident_id: string; correlation_id: string | null }
  | {
    kind: "application_workflow";
    application_id: string;
    binding_id: string;
    workflow_run_id: string;
  };

export interface TimelineEndpointEvent {
  event_id: string;
  source: "inventory" | "incident" | "application_workflow" | "kubernetes_event" | "gitops";
  source_key: string;
  native_id: string;
  activity: "change" | "k8s_event" | "warning" | "unhealthy";
  occurred_at: string;
  scope: TimelineEndpointScope;
  subject: TimelineEndpointSubject;
  resource: TimelineEndpointResourceRef | null;
  event_type: "add" | "update" | "delete" | "k8s_event" | "incident" | "deployment" | "gitops_change";
  severity: "info" | "warning" | "critical" | "unknown";
  title: string;
  owner: TimelineEndpointResourceRef | null;
  metadata: Readonly<Record<string, unknown>>;
}

export interface TimelineEndpointCursor {
  token: string;
}

export interface TimelineEndpointPolicy {
  max_batch_events: number;
  max_frames_per_second: number;
  retention_seconds: number;
  resume: "cursor";
  hidden_tab: "coalesce";
  reconnect: {
    min_delay_ms: number;
    max_delay_ms: number;
    strategy: "full_jitter_exponential";
  };
}

export interface TimelineEndpointCoverage {
  scope: TimelineEndpointScope;
  source: TimelineEndpointEvent["source"];
  from_ms: number;
  to_ms: number;
  reason: "collection_gap" | "retention_boundary" | "partial_scope";
}

export interface TimelineEndpointQuery {
  scopes: TimelineEndpointScope[];
  window: { from_ms: number; to_ms: number };
  filters: {
    activity: TimelineEndpointEvent["activity"][];
    kinds: string[];
    include_deleted: boolean;
    pinned_only: boolean;
    query: string;
  };
  grouping: "app" | "owner" | "flat";
  sort: "importance" | "recent" | "name";
}

export interface TimelineEndpointSnapshot {
  snapshot: {
    kind: "snapshot";
    cursor: TimelineEndpointCursor;
    scopes: readonly TimelineEndpointScope[];
    policy: TimelineEndpointPolicy;
    events: readonly TimelineEndpointEvent[];
    coverage: readonly TimelineEndpointCoverage[];
  };
  end: { kind: "end"; cursor: TimelineEndpointCursor };
}

export type TimelineEndpointStreamFrame =
  | { kind: "event"; cursor: TimelineEndpointCursor; event: TimelineEndpointEvent }
  | {
    kind: "coverage";
    cursor: TimelineEndpointCursor;
    coverage: readonly TimelineEndpointCoverage[];
  }
  | { kind: "resync_required"; cursor: TimelineEndpointCursor; reason: string }
  | { kind: "error"; cursor: TimelineEndpointCursor; reason: string };

export interface TimelineEndpointStreamSubscription {
  onLifecycle?: (lifecycle:
    | { state: "connecting" }
    | { state: "connected" }
    | { state: "reconnecting"; attempt: number; retryAfterMs: number | null }
    | { state: "closed" }
    | { state: "failed"; failure: "forbidden" | "invalid" | "unavailable" }
  ) => void;
  signal?: AbortSignal;
}

export interface TimelineEndpointDependencies {
  getTimelineSnapshot(
    input: { query: TimelineEndpointQuery },
    signal?: AbortSignal,
  ): Promise<TimelineEndpointSnapshot>;
  subscribeTimelineEvents(
    input: { query: TimelineEndpointQuery; after: TimelineEndpointCursor },
    subscription?: TimelineEndpointStreamSubscription,
  ): AsyncIterable<TimelineEndpointStreamFrame>;
}

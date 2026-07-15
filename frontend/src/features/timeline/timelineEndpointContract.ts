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
  live_session: {
    max_age_ms: number;
    strategy: "replace_with_snapshot";
  };
}

export interface TimelineEndpointCapabilityDescriptor {
  selected_source_mode: "retained" | "local";
  available_source_modes: readonly ("retained" | "local")[];
  max_retained_range_ms: number;
  namespace_filter_policy: "not_required" | "required";
  control_surface: TimelineEndpointControlSurface;
}

export interface TimelineEndpointControlOption {
  id: string;
  label: string;
  description: string | null;
}

export interface TimelineEndpointControlSurface {
  views: readonly TimelineEndpointControlOption[];
  groupings: readonly TimelineEndpointControlOption[];
  sorts: readonly TimelineEndpointControlOption[];
  activity: readonly (TimelineEndpointControlOption & {
    activity: readonly TimelineEndpointEvent["activity"][];
    problems_activity: readonly TimelineEndpointEvent["activity"][];
  })[];
  deleted: { key: string; label: string; default: boolean };
  kinds: { key: string; label: string; selection: "multi"; empty_selection: "all" };
  time_ranges: readonly (TimelineEndpointControlOption & { duration_ms: number })[];
  default_time_range_id: string;
  custom_time_range_id: "custom";
  lens_zoom_rungs: readonly (TimelineEndpointControlOption & { duration_ms: number })[];
  default_lens_zoom_rung: string;
  legend: {
    key: "legend";
    label: string;
    availability: "available";
    items: readonly TimelineEndpointControlOption[];
  };
  pins: TimelineEndpointPinsControl;
}

export type TimelineEndpointPinsControl =
  | {
    key: "pins";
    label: string;
    availability: "available";
    storage: "server";
    revision: "pin_set";
    subject_kinds: readonly ["resource", "application"];
  }
  | {
    key: "pins";
    label: string;
    availability: "unavailable";
    storage: null;
    revision: null;
    subject_kinds: readonly [];
  };

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
  mode: "live" | "frozen";
  filters: {
    activity: TimelineEndpointEvent["activity"][];
    kinds: string[];
    include_deleted: boolean;
    pinned_only: boolean;
    query: string;
  };
  grouping: "app" | "owner" | "flat";
  sort: "importance" | "recent" | "name";
  view: "list" | "swimlane";
  range_id: string;
  lens_zoom_rung: string;
}

export interface TimelineEndpointOverview {
  window: { from_ms: number; to_ms: number };
  bucket_width_ms: number;
  buckets: readonly {
    from_ms: number;
    to_ms: number;
    event_count: number;
    problem_count: number;
  }[];
  coverage: readonly TimelineEndpointCoverage[];
  coverage_sources: readonly {
    source: TimelineEndpointEvent["source"];
    availability: "observed" | "unavailable";
  }[];
  facets: {
    activity: readonly { activity: TimelineEndpointEvent["activity"]; count: number }[];
    kinds: readonly { kind: string; count: number }[];
  };
  new_evidence_count: number | null;
  pin_set_revision: number | null;
}

export type TimelineEndpointPinTarget =
  | {
    kind: "resource";
    scope: TimelineEndpointScope;
    resource: TimelineEndpointResourceRef;
  }
  | { kind: "application"; application_id: string };

export type TimelineEndpointPinSubject =
  | {
    kind: "resource";
    scope: TimelineEndpointScope;
    resource: TimelineEndpointResourceRef;
  }
  | {
    kind: "application";
    application_id: string;
    snapshot: { name: string; repository_id: string; manifest_path: string };
  };

export interface TimelineEndpointPin {
  pin_id: string;
  subject: TimelineEndpointPinSubject;
  created_at: string;
}

export interface TimelineEndpointPinSet {
  revision: number;
  pins: readonly TimelineEndpointPin[];
}

export interface TimelineEndpointPinMutation {
  action: "added" | "unchanged" | "deleted" | "absent";
  pin_set: TimelineEndpointPinSet;
}

export interface TimelineEndpointPinUpsert {
  expected_revision: number;
  target: TimelineEndpointPinTarget;
}

export interface TimelineEndpointSnapshot {
  snapshot: {
    kind: "snapshot";
    cursor: TimelineEndpointCursor;
    scopes: readonly TimelineEndpointScope[];
    policy: TimelineEndpointPolicy;
    capabilities: TimelineEndpointCapabilityDescriptor;
    events: readonly TimelineEndpointEvent[];
    coverage: readonly TimelineEndpointCoverage[];
    pin_set_revision: number | null;
  };
  end: { kind: "end"; cursor: TimelineEndpointCursor; pin_set_revision: null };
}

export type TimelineEndpointStreamFrame =
  | {
    kind: "event";
    cursor: TimelineEndpointCursor;
    event: TimelineEndpointEvent;
    pin_set_revision: null;
  }
  | {
    kind: "coverage";
    cursor: TimelineEndpointCursor;
    coverage: readonly TimelineEndpointCoverage[];
    pin_set_revision: null;
  }
  | { kind: "resync_required"; cursor: TimelineEndpointCursor; reason: string; pin_set_revision: null }
  | { kind: "error"; cursor: TimelineEndpointCursor; reason: string; pin_set_revision: null };

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
  getTimelineCapabilities(
    signal?: AbortSignal,
  ): Promise<TimelineEndpointCapabilityDescriptor>;
  getTimelineSnapshot(
    input: { query: TimelineEndpointQuery },
    signal?: AbortSignal,
  ): Promise<TimelineEndpointSnapshot>;
  getTimelineOverview(
    input: { query: TimelineEndpointQuery },
    signal?: AbortSignal,
  ): Promise<TimelineEndpointOverview>;
  getTimelinePins(signal?: AbortSignal): Promise<TimelineEndpointPinSet>;
  upsertTimelinePin(
    input: TimelineEndpointPinUpsert,
    signal?: AbortSignal,
  ): Promise<TimelineEndpointPinMutation>;
  removeTimelinePin(
    pinId: string,
    expectedRevision: number,
    signal?: AbortSignal,
  ): Promise<TimelineEndpointPinMutation>;
  subscribeTimelineEvents(
    input: { query: TimelineEndpointQuery; after: TimelineEndpointCursor },
    subscription?: TimelineEndpointStreamSubscription,
  ): AsyncIterable<TimelineEndpointStreamFrame>;
}

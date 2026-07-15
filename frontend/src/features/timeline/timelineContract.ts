import type { ClusterScope, ResourceRef } from "../../shared/parity/referenceParity";

export type TimelineFailureCode =
  | "forbidden"
  | "invalid-request"
  | "invalid-response"
  | "offline"
  | "unavailable"
  | "unknown";

export class TimelineFailure extends Error {
  readonly code: TimelineFailureCode;
  readonly reason: string | null;

  constructor(code: TimelineFailureCode, reason: string | null = null) {
    super(`Timeline request failed: ${code}`);
    this.name = "TimelineFailure";
    this.code = code;
    this.reason = reason;
  }
}

export type TimelineSourceMode = "local" | "retained";

/** The exact, server-owned descriptor used to bootstrap one Timeline read. */
export interface TimelineCapabilityDescriptor {
  selectedSourceMode: TimelineSourceMode;
  availableSourceModes: readonly TimelineSourceMode[];
  maxRetainedRangeMs: number;
  namespaceFilterPolicy: "not_required" | "required";
}

/** Server descriptor is the only Timeline capability projection used by the UI. */
export type TimelineCapabilities = TimelineCapabilityDescriptor;

export type TimelineMode =
  | { kind: "live"; widthMs: number; all?: true }
  | { kind: "frozen"; fromMs: number; toMs: number };

export type TimelineViewMode = "list" | "swimlane";
export type TimelineActivityKey = "changes" | "k8s_events" | "unhealthy" | "warnings";
export type TimelineActivity = "change" | "k8s_event" | "unhealthy" | "warning";
export type TimelineGrouping = "app" | "flat" | "owner";
export type TimelineSort = "importance" | "name" | "recent";
export type TimelineSource =
  | "inventory"
  | "incident"
  | "application_workflow"
  | "kubernetes_event"
  | "gitops";
export type TimelineEventType =
  | "add"
  | "update"
  | "delete"
  | "k8s_event"
  | "incident"
  | "deployment"
  | "gitops_change";
export type TimelineSeverity = "info" | "warning" | "critical" | "unknown";

export interface TimelineFilters {
  activity: readonly TimelineActivityKey[];
  kinds: readonly string[];
  showDeleted: boolean;
  pinnedOnly: boolean;
  search: string;
  grouping: TimelineGrouping;
  sort: TimelineSort;
  /** URL `event` contains the ledger-unique source key, not the non-unique event ID. */
  selectedEventKey: string | null;
}

export interface TimelineQuery {
  scopes: readonly ClusterScope[];
  mode: TimelineMode;
  filters: TimelineFilters;
}

export interface TimelineWindow {
  fromMs: number;
  toMs: number;
}

/** Opaque authorization-bound resume position. It is never a sequence number. */
export interface TimelineCursor {
  token: string;
}

export interface TimelineRealtimePolicy {
  maxBatchEvents: number;
  maxFramesPerSecond: number;
  retentionSeconds: number;
  resume: "cursor";
  hiddenTab: "coalesce";
  reconnect: TimelineReconnectPolicy;
  liveSession: TimelineLiveSessionPolicy;
}

export interface TimelineReconnectPolicy {
  minDelayMs: number;
  maxDelayMs: number;
  strategy: "full_jitter_exponential";
}

/** Server-owned maximum age for a moving live-window cursor/session pair. */
export interface TimelineLiveSessionPolicy {
  maxAgeMs: number;
  strategy: "replace_with_snapshot";
}

export interface TimelineCoverage {
  scope: ClusterScope;
  source: TimelineSource;
  fromMs: number;
  toMs: number;
  reason: "collection_gap" | "retention_boundary" | "partial_scope";
}

export type TimelineSubject =
  | { kind: "resource"; resource: ResourceRef }
  | {
    kind: "inventory_locator";
    inventoryKey: string;
    apiGroup: string;
    version: string;
    resourceKind: string;
    namespace: string | null;
    name: string;
  }
  | { kind: "incident"; incidentId: string; correlationId: string | null }
  | {
    kind: "application_workflow";
    applicationId: string;
    bindingId: string;
    workflowRunId: string;
  };

export interface TimelineEvent {
  id: string;
  source: TimelineSource;
  sourceKey: string;
  nativeId: string;
  activity: TimelineActivity;
  occurredAt: string;
  scope: ClusterScope;
  subject: TimelineSubject;
  resource: ResourceRef | null;
  type: TimelineEventType;
  severity: TimelineSeverity;
  title: string;
  owner: ResourceRef | null;
  metadata: Readonly<Record<string, unknown>>;
}

/** A fixed bounded snapshot identity reused for all opaque cursor resumes. */
export interface TimelineReadSession {
  query: TimelineQuery;
  window: TimelineWindow;
  cursor: TimelineCursor;
  policy: TimelineRealtimePolicy;
}

export interface TimelineSnapshot {
  session: TimelineReadSession;
  scopes: readonly ClusterScope[];
  policy: TimelineRealtimePolicy;
  events: readonly TimelineEvent[];
  coverage: readonly TimelineCoverage[];
}

export type TimelineStreamFrame =
  | { kind: "event"; cursor: TimelineCursor; event: TimelineEvent }
  | { kind: "coverage"; cursor: TimelineCursor; coverage: readonly TimelineCoverage[] }
  | { kind: "resync_required"; cursor: TimelineCursor; reason: string }
  | { kind: "error"; cursor: TimelineCursor; reason: string };

export type TimelineStreamLifecycle =
  | { state: "connecting" }
  | { state: "connected" }
  | { state: "reconnecting"; attempt: number; retryAfterMs: number | null }
  | { state: "closed" }
  | { state: "failed"; failure: "forbidden" | "invalid" | "unavailable" };

export interface TimelineStreamSubscription {
  onLifecycle?: (lifecycle: TimelineStreamLifecycle) => void;
  signal?: AbortSignal;
}

/**
 * The product supplies this port through composition. This feature owns the
 * UI/session contract but never imports an HTTP path, fixture, or EventSource.
 */
export interface TimelinePort {
  capabilities: TimelineCapabilities;
  /**
   * Product routes fail closed when this bootstrap reader is unavailable.
   * `workspaceCacheKey` isolates browser memory only; it is never sent to the API.
   */
  readCapabilities?(signal?: AbortSignal, workspaceCacheKey?: string): Promise<TimelineCapabilities>;
  readTimeline(query: TimelineQuery, signal?: AbortSignal): Promise<TimelineSnapshot>;
  subscribeTimeline(
    session: TimelineReadSession,
    subscription?: TimelineStreamSubscription,
  ): AsyncIterable<TimelineStreamFrame>;
}

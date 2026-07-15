export type TimelineFailureCode =
  | "forbidden"
  | "invalid-response"
  | "offline"
  | "unavailable"
  | "unknown";

export class TimelineFailure extends Error {
  readonly code: TimelineFailureCode;

  constructor(code: TimelineFailureCode) {
    super(`Timeline request failed: ${code}`);
    this.name = "TimelineFailure";
    this.code = code;
  }
}

export type TimelineSourceMode = "local" | "retained";

export interface TimelineCapabilities {
  sourceMode: TimelineSourceMode;
  maxRangeDays: number | null;
  requiresNamespaceFilter: boolean;
}

export interface TimelineScope {
  workspaceId: string;
  clusterIds: readonly string[];
  namespaces: readonly string[];
  freshness: "cached" | "live";
}

export type TimelineMode =
  | { kind: "live"; widthMs: number; all?: true }
  | { kind: "frozen"; fromMs: number; toMs: number };

export type TimelineViewMode = "list" | "swimlane";
export type TimelineActivityKey = "changes" | "k8s_events" | "unhealthy" | "warnings";
export type TimelineGrouping = "app" | "flat" | "owner";
export type TimelineSort = "importance" | "name" | "recent";

export interface TimelineFilters {
  activity: readonly TimelineActivityKey[];
  kinds: readonly string[];
  showDeleted: boolean;
  pinnedOnly: boolean;
  search: string;
  grouping: TimelineGrouping;
  sort: TimelineSort;
  selectedEventId: string | null;
}

export interface TimelineQuery {
  scope: TimelineScope;
  mode: TimelineMode;
  filters: TimelineFilters;
}

export interface TimelineSnapshot {
  eventCount: number;
}

/**
 * The product supplies this port through composition. This feature intentionally
 * owns no HTTP path, response fixture, or browser event source.
 */
export interface TimelinePort {
  capabilities: TimelineCapabilities;
  readTimeline(query: TimelineQuery, signal?: AbortSignal): Promise<TimelineSnapshot>;
}

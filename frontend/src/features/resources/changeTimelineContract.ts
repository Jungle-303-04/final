import type { UnifiedFilterState } from "../filters/filterContract";

export type ChangeTimelineEventKind = "inventory_event" | "incident" | "deployment" | "gitops_change";
export type ChangeTimelineSeverity = "info" | "warning" | "critical" | "unknown";

export interface ChangeTimelineSnapshot {
  fromMs: number;
  toMs: number;
  bucketMs: number;
  buckets: Array<{ startMs: number; endMs: number; total: number; warnings: number }>;
  events: Array<{
    id: string;
    kind: ChangeTimelineEventKind;
    occurredMs: number;
    title: string;
    severity: ChangeTimelineSeverity;
  }>;
  gaps: Array<{ from: number; to: number }>;
}

export interface ChangeTimelineOptions {
  fromMs: number;
  toMs: number;
  bucketMs: number;
}

export interface ChangeTimelinePort {
  loadChangeTimeline(
    state: UnifiedFilterState,
    options: ChangeTimelineOptions,
    signal?: AbortSignal,
  ): Promise<ChangeTimelineSnapshot>;
}

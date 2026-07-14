import type { ResourcesFilterEndpointQuery } from "./resourcesFilterEndpointContract";
import type { ChangeTimelineEventKind, ChangeTimelineSeverity } from "./changeTimelineContract";

export interface ChangeTimelineEndpointQuery extends Omit<ResourcesFilterEndpointQuery, "includeDeleted" | "cursor" | "limit"> {
  fromMs: number;
  toMs: number;
  bucketMs: number;
}

export interface ChangeTimelineEndpointResponse {
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

export interface ChangeTimelineEndpointDependencies {
  getChangeTimeline(
    query: ChangeTimelineEndpointQuery,
    signal?: AbortSignal,
  ): Promise<ChangeTimelineEndpointResponse>;
}

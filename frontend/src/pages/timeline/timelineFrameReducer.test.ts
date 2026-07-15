import { describe, expect, it } from "vitest";

import type {
  TimelineCoverage,
  TimelineEvent,
  TimelineQuery,
  TimelineSnapshot,
  TimelineStreamFrame,
} from "../../features/timeline/timelineContract";
import { timelineEvidenceKey } from "../../features/timeline/timelineEvidenceIdentity";
import { applyTimelineFrames, normalizeTimelineSnapshot } from "./timelineFrameReducer";

describe("Timeline evidence frame reducer", () => {
  it("deduplicates opaque stream replay by source identity and retains only the server cap", () => {
    const initial = normalizeTimelineSnapshot(snapshot([event("one")]));
    const frames: TimelineStreamFrame[] = [
      { kind: "event", cursor: { token: "opaque.one-replayed" }, event: event("one") },
      { kind: "event", cursor: { token: "opaque.two" }, event: event("two") },
      { kind: "event", cursor: { token: "opaque.three" }, event: event("three") },
    ];

    const reduced = applyTimelineFrames(initial, frames);

    expect(reduced.events.map((item) => item.id)).toEqual(["two", "three"]);
    expect(reduced.events).toHaveLength(reduced.policy.maxBatchEvents);
  });

  it("does not replace a durable session for grouping, sort, or unsupported pin preferences", () => {
    const query = timelineQuery();
    const presentationOnly: TimelineQuery = {
      ...query,
      filters: {
        ...query.filters,
        grouping: "flat",
        sort: "name",
        pinnedOnly: true,
      },
    };

    expect(timelineEvidenceKey(presentationOnly)).toBe(timelineEvidenceKey(query));
    expect(timelineEvidenceKey({
      ...query,
      filters: { ...query.filters, search: "changed" },
    })).not.toBe(timelineEvidenceKey(query));
  });

  it("merges snapshot and live coverage deltas once, even across replayed namespace order", () => {
    const initial = normalizeTimelineSnapshot(snapshot([], [coverage(["payments", "shop"])]));
    const reduced = applyTimelineFrames(initial, [
      { kind: "coverage", cursor: { token: "opaque.coverage-replay" }, coverage: [coverage(["shop", "payments"])] },
      { kind: "coverage", cursor: { token: "opaque.coverage-next" }, coverage: [coverage(["payments"], 2_000, 3_000)] },
    ]);

    expect(reduced.coverage).toHaveLength(2);
    expect(reduced.coverage.map((item) => [item.fromMs, item.toMs])).toEqual([
      [1_000, 2_000],
      [2_000, 3_000],
    ]);
  });
});

function snapshot(
  events: readonly TimelineEvent[],
  coverage: readonly TimelineCoverage[] = [],
): TimelineSnapshot {
  const query = timelineQuery();
  const policy = {
    maxBatchEvents: 2,
    maxFramesPerSecond: 60,
    retentionSeconds: 86_400,
    resume: "cursor" as const,
    hiddenTab: "coalesce" as const,
    reconnect: {
      minDelayMs: 100,
      maxDelayMs: 200,
      strategy: "full_jitter_exponential" as const,
    },
    liveSession: {
      maxAgeMs: 30_000,
      strategy: "replace_with_snapshot" as const,
    },
  };
  return {
    session: {
      query,
      window: { fromMs: 1_000, toMs: 2_000 },
      cursor: { token: "opaque.snapshot" },
      policy,
    },
    scopes: query.scopes,
    policy,
    events,
    coverage,
    pinSetRevision: null,
  };
}

function coverage(
  namespaces: readonly string[],
  fromMs = 1_000,
  toMs = 2_000,
): TimelineCoverage {
  return {
    scope: { workspaceId: "workspace-a", clusterId: "cluster-a", namespaces, freshness: "live" },
    source: "kubernetes_event",
    fromMs,
    toMs,
    reason: "collection_gap",
  };
}

function timelineQuery(): TimelineQuery {
  return {
    scopes: [{ workspaceId: "workspace-a", clusterId: "cluster-a", namespaces: [], freshness: "live" }],
    mode: { kind: "live", widthMs: 1_000 },
    control: { view: "swimlane", rangeId: "1h", lensZoomRung: "1h" },
    filters: {
      activity: [],
      kinds: [],
      showDeleted: true,
      pinnedOnly: false,
      search: "",
      grouping: "app",
      sort: "importance",
      selectedEventKey: null,
    },
  };
}

function event(id: string): TimelineEvent {
  const resource = {
    apiGroup: "apps",
    version: "v1",
    kind: "Deployment",
    namespace: "payments",
    name: id,
    uid: `${id}-uid`,
  };
  return {
    id,
    source: "inventory",
    sourceKey: `inventory:${id}`,
    nativeId: id,
    activity: "change",
    occurredAt: "2026-07-15T00:00:00Z",
    scope: { workspaceId: "workspace-a", clusterId: "cluster-a", namespaces: [], freshness: "live" },
    subject: { kind: "resource", resource },
    resource,
    type: "update",
    severity: "info",
    title: id,
    owner: null,
    metadata: {},
  };
}

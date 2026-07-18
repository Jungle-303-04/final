import { describe, expect, it, vi } from "vitest";

import { createEmptyUnifiedFilterState } from "../filters/filterContract";
import type {
  TimelineCapabilities,
  TimelinePort,
  TimelineQuery,
  TimelineSnapshot,
  TimelineStreamFrame,
} from "../timeline/timelineContract";
import { watchChangeTimelineInvalidations } from "./changeTimelineInvalidation";

describe("change timeline invalidation watcher", () => {
  it("reuses the authorized Timeline cursor and narrows the live invalidation query", async () => {
    const filterState = createEmptyUnifiedFilterState();
    filterState.common.clusters = ["cluster-a"];
    filterState.common.namespaces = [{ clusterId: "cluster-a", namespace: "shop" }];
    filterState.resources.types = ["pod"];
    filterState.resources.query = "checkout";
    const port = timelinePort(async function* () {
      yield streamFrame("event", "cursor-2");
    });
    const onInvalidate = vi.fn();

    await watchChangeTimelineInvalidations({
      filterState,
      onInvalidate,
      port,
      signal: new AbortController().signal,
      window: { fromMs: 1_000, toMs: 3_000, bucketMs: 1_000 },
      workspaceId: "workspace-a",
    });

    const query = vi.mocked(port.readTimeline).mock.calls[0]?.[0];
    expect(query).toMatchObject({
      scopes: [{
        workspaceId: "workspace-a",
        clusterId: "cluster-a",
        namespaces: ["shop"],
      }],
      mode: { kind: "live", widthMs: 2_000 },
      filters: {
        activity: ["changes"],
        kinds: ["pod"],
        search: "checkout",
        showDeleted: false,
      },
    });
    expect(onInvalidate).toHaveBeenCalledOnce();
  });

  it("replaces the retained cursor after an explicit resync frame", async () => {
    let subscription = 0;
    const port = timelinePort(async function* () {
      subscription += 1;
      yield subscription === 1
        ? streamFrame("resync_required", "cursor-resync")
        : streamFrame("error", "cursor-error");
    });

    await watchChangeTimelineInvalidations({
      filterState: boundedFilter(),
      onInvalidate: vi.fn(),
      port,
      signal: new AbortController().signal,
      window: { fromMs: 1_000, toMs: 3_000, bucketMs: 1_000 },
      workspaceId: "workspace-a",
    });

    expect(port.readTimeline).toHaveBeenCalledTimes(2);
    expect(port.subscribeTimeline).toHaveBeenCalledTimes(2);
  });
});

function boundedFilter() {
  const state = createEmptyUnifiedFilterState();
  state.common.clusters = ["cluster-a"];
  state.resources.types = ["pod"];
  return state;
}

function timelinePort(
  frames: () => AsyncGenerator<TimelineStreamFrame>,
): Pick<TimelinePort, "readCapabilities" | "readTimeline" | "subscribeTimeline"> {
  const capabilities = timelineCapabilities();
  return {
    readCapabilities: vi.fn().mockResolvedValue(capabilities),
    readTimeline: vi.fn().mockImplementation((query: TimelineQuery) => (
      Promise.resolve(timelineSnapshot(query))
    )),
    subscribeTimeline: vi.fn().mockImplementation(frames),
  };
}

function timelineCapabilities(): TimelineCapabilities {
  return {
    selectedSourceMode: "retained",
    availableSourceModes: ["retained"],
    maxRetainedRangeMs: 86_400_000,
    queryBounds: {
      serverNowMs: 10_000,
      earliestQueryableMs: 0,
      maxWindowMs: 86_400_000,
    },
    namespaceFilterPolicy: "not_required",
    controlSurface: {
      views: [{ id: "list", label: "List", description: null }],
      groupings: [{ id: "app", label: "Application", description: null }],
      sorts: [{ id: "importance", label: "Importance", description: null }],
      activity: [{
        id: "changes",
        label: "Changes",
        description: null,
        activity: ["change"],
        problemsActivity: [],
      }],
      deleted: { key: "show_deleted", label: "Deleted", default: false },
      kinds: { key: "kinds", label: "Kinds", selection: "multi", emptySelection: "all" },
      timeRanges: [{ id: "custom", label: "Custom", description: null, durationMs: 2_000 }],
      defaultTimeRangeId: "custom",
      customTimeRangeId: "custom",
      lensZoomRungs: [{ id: "1h", label: "1h", description: null, durationMs: 3_600_000 }],
      defaultLensZoomRung: "1h",
      legend: { key: "legend", label: "Legend", availability: "available", items: [] },
      pins: {
        key: "pins",
        label: "Pins",
        availability: "unavailable",
        storage: null,
        revision: null,
        subjectKinds: [],
      },
    },
  };
}

function timelineSnapshot(query: TimelineQuery): TimelineSnapshot {
  return {
    session: {
      query,
      window: { fromMs: 1_000, toMs: 3_000 },
      cursor: { token: "cursor-1" },
      policy: {
        maxBatchEvents: 1_000,
        maxFramesPerSecond: 60,
        retentionSeconds: 86_400,
        resume: "cursor",
        hiddenTab: "coalesce",
        reconnect: {
          minDelayMs: 500,
          maxDelayMs: 30_000,
          strategy: "full_jitter_exponential",
        },
        liveSession: { maxAgeMs: 30_000, strategy: "replace_with_snapshot" },
      },
    },
    scopes: query.scopes,
    policy: {
      maxBatchEvents: 1_000,
      maxFramesPerSecond: 60,
      retentionSeconds: 86_400,
      resume: "cursor",
      hiddenTab: "coalesce",
      reconnect: {
        minDelayMs: 500,
        maxDelayMs: 30_000,
        strategy: "full_jitter_exponential",
      },
      liveSession: { maxAgeMs: 30_000, strategy: "replace_with_snapshot" },
    },
    events: [],
    coverage: [],
    truncated: false,
    eventLimit: null,
    pinSetRevision: null,
  };
}

function streamFrame(
  kind: "event" | "resync_required" | "error",
  token: string,
): TimelineStreamFrame {
  if (kind === "event") {
    return {
      kind,
      cursor: { token },
      event: {
        id: "change-1",
        source: "inventory",
        sourceKey: "inventory:change-1",
        nativeId: "change-1",
        activity: "change",
        occurredAt: "2026-07-17T00:00:00Z",
        scope: {
          workspaceId: "workspace-a",
          clusterId: "cluster-a",
          namespaces: ["shop"],
          freshness: "live",
        },
        subject: {
          kind: "inventory_locator",
          inventoryKey: "pod:shop/checkout",
          apiGroup: "",
          version: "v1",
          resourceKind: "Pod",
          namespace: "shop",
          name: "checkout",
        },
        resource: null,
        type: "update",
        severity: "info",
        title: "Pod changed",
        owner: null,
        metadata: {},
      },
    };
  }
  return { kind, cursor: { token }, reason: kind };
}

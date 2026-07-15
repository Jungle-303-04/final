import { describe, expect, it, vi } from "vitest";

import { createTimelineAdapter } from "./createTimelineAdapter";
import type {
  TimelineEndpointDependencies,
  TimelineEndpointCapabilityDescriptor,
  TimelineEndpointSnapshot,
  TimelineEndpointStreamFrame,
} from "./timelineEndpointContract";
import type { TimelineQuery } from "./timelineContract";

describe("Timeline adapter", () => {
  it("does not publish a synchronous retained/local fallback before preflight", () => {
    const adapter = createTimelineAdapter({
      getTimelineCapabilities: async () => capabilities(),
      getTimelineSnapshot: async () => snapshot("opaque.snapshot"),
      subscribeTimelineEvents: async function* () {},
    });

    expect(() => adapter.capabilities).toThrowError(expect.objectContaining({
      code: "invalid-response",
      reason: "Timeline capabilities have not been bootstrapped.",
    }));
  });

  it("preflights one server capability descriptor before its first snapshot", async () => {
    const order: string[] = [];
    const adapter = createTimelineAdapter({
      getTimelineCapabilities: async () => {
        order.push("capabilities");
        return capabilities();
      },
      getTimelineSnapshot: async () => {
        order.push("snapshot");
        return snapshot("opaque.snapshot");
      },
      subscribeTimelineEvents: async function* () {},
      now: () => 10_000,
    });

    await adapter.readTimeline(timelineQuery());
    const readCapabilities = adapter.readCapabilities;
    if (readCapabilities === undefined) throw new Error("Timeline adapter must expose capability preflight");

    expect(order).toEqual(["capabilities", "snapshot"]);
    await expect(readCapabilities()).resolves.toEqual({
      selectedSourceMode: "retained",
      availableSourceModes: ["retained"],
      maxRetainedRangeMs: 7_200_000,
      namespaceFilterPolicy: "not_required",
    });
    expect(adapter.capabilities).toEqual({
      sourceMode: "retained",
      maxRangeDays: 7_200_000 / 86_400_000,
      requiresNamespaceFilter: false,
    });
  });

  it("fails closed when a snapshot descriptor differs from its preflight", async () => {
    const adapter = createTimelineAdapter({
      getTimelineCapabilities: async () => capabilities(),
      getTimelineSnapshot: async () => snapshot("opaque.snapshot", [], {
        ...capabilities(),
        namespace_filter_policy: "required",
      }),
      subscribeTimelineEvents: async function* () {},
      now: () => 10_000,
    });

    await expect(adapter.readTimeline(timelineQuery())).rejects.toMatchObject({
      code: "invalid-response",
    });
  });

  it("maps URL activity keys, common scope fields, filters, and a finite live window", async () => {
    const getTimelineSnapshot = vi.fn().mockResolvedValue(snapshot("opaque.snapshot"));
    const adapter = createTimelineAdapter({
      getTimelineCapabilities: async () => capabilities(),
      getTimelineSnapshot,
      subscribeTimelineEvents: async function* () {},
      now: () => 10_000,
    });
    const query = timelineQuery({
      filters: {
        ...timelineQuery().filters,
        activity: ["changes", "k8s_events", "warnings", "unhealthy"],
        kinds: ["Deployment", "Pod"],
        pinnedOnly: true,
        search: "checkout",
        showDeleted: false,
        grouping: "owner",
        sort: "recent",
      },
      mode: { kind: "live", widthMs: 2_000 },
    });

    const result = await adapter.readTimeline(query);

    expect(getTimelineSnapshot).toHaveBeenCalledWith({
      query: expect.objectContaining({
        window: { from_ms: 8_000, to_ms: 10_000 },
        filters: {
          activity: ["change", "k8s_event", "warning", "unhealthy"],
          kinds: ["Deployment", "Pod"],
          include_deleted: false,
          pinned_only: true,
          query: "checkout",
        },
        grouping: "owner",
        sort: "recent",
        mode: "live",
      }),
    }, undefined);
    expect(result.scopes[0]).toEqual({
      workspaceId: "workspace-a",
      clusterId: "cluster-a",
      namespaces: ["payments"],
      freshness: "stale",
    });
    expect(result.events.map((event) => event.id)).toEqual(["event-1"]);
    expect(result.session.window).toEqual({ fromMs: 8_000, toMs: 10_000 });
    expect(result.session.policy.reconnect).toEqual({
      minDelayMs: 100,
      maxDelayMs: 200,
      strategy: "full_jitter_exponential",
    });
  });

  it("resumes an interrupted live stream from the opaque event cursor using only the server retry policy", async () => {
    const streams = [
      streamOf(eventFrame("opaque.first")),
      streamOf(eventFrame("opaque.second"), errorFrame("opaque.second")),
    ];
    const subscribeTimelineEvents = vi.fn((_, subscription) => {
      subscription?.onLifecycle?.({ state: "connected" });
      return streams.shift() ?? streamOf(errorFrame("opaque.second"));
    });
    const adapter = createTimelineAdapter({
      getTimelineCapabilities: async () => capabilities(),
      getTimelineSnapshot: async () => snapshot("opaque.snapshot"),
      subscribeTimelineEvents,
      now: () => 10_000,
      random: () => 0,
    });
    const initial = await adapter.readTimeline(timelineQuery());
    const lifecycle: unknown[] = [];
    const frames: TimelineEndpointStreamFrame["kind"][] = [];

    for await (const frame of adapter.subscribeTimeline(initial.session, {
      onLifecycle: (state) => lifecycle.push(state),
    })) {
      frames.push(frame.kind);
    }

    expect(frames).toEqual(["event", "event", "error"]);
    expect(subscribeTimelineEvents).toHaveBeenCalledTimes(2);
    expect(subscribeTimelineEvents.mock.calls[1]?.[0]).toEqual(expect.objectContaining({
      after: { token: "opaque.first" },
    }));
    expect(lifecycle).toContainEqual({ state: "reconnecting", attempt: 1, retryAfterMs: 100 });
    expect(lifecycle[lifecycle.length - 1]).toEqual({ state: "closed" });
  });

  it("keeps a frozen URL window unchanged for the snapshot and every cursor resume", async () => {
    const dependencies: TimelineEndpointDependencies = {
      getTimelineCapabilities: async () => capabilities(),
      getTimelineSnapshot: async () => snapshot("opaque.snapshot"),
      subscribeTimelineEvents: async function* () {
        yield errorFrame("opaque.snapshot");
      },
    };
    const adapter = createTimelineAdapter(dependencies);
    const query = timelineQuery({ mode: { kind: "frozen", fromMs: 3_000, toMs: 9_000 } });
    const loaded = await adapter.readTimeline(query);
    const frames = [
      ...await collect(adapter.subscribeTimeline(loaded.session)),
    ];

    expect(loaded.session.window).toEqual({ fromMs: 3_000, toMs: 9_000 });
    expect(frames.map((frame) => frame.kind)).toEqual(["error"]);
  });

  it("keeps the opaque cursor when only presentation preferences change", async () => {
    const subscribeTimelineEvents = vi.fn(() => streamOf(errorFrame("opaque.snapshot")));
    const adapter = createTimelineAdapter({
      getTimelineCapabilities: async () => capabilities(),
      getTimelineSnapshot: async () => snapshot("opaque.snapshot"),
      subscribeTimelineEvents,
      now: () => 10_000,
    });
    const loaded = await adapter.readTimeline(timelineQuery());
    const presentationOnly = {
      ...loaded.session,
      query: {
        ...loaded.session.query,
        filters: {
          ...loaded.session.query.filters,
          grouping: "flat" as const,
          sort: "name" as const,
          pinnedOnly: true,
        },
      },
    };

    await collect(adapter.subscribeTimeline(presentationOnly));

    expect(subscribeTimelineEvents).toHaveBeenCalledWith(expect.objectContaining({
      after: { token: "opaque.snapshot" },
      query: expect.objectContaining({
        grouping: "flat",
        sort: "name",
        filters: expect.objectContaining({ pinned_only: true }),
      }),
    }), expect.objectContaining({
      onLifecycle: expect.any(Function),
      signal: undefined,
    }));
  });

  it("maps server-authorized snapshot coverage without reapplying client filters", async () => {
    const adapter = createTimelineAdapter({
      getTimelineCapabilities: async () => capabilities(),
      getTimelineSnapshot: async () => snapshot("opaque.snapshot", [coverageFrame("opaque.coverage").coverage[0]!]),
      subscribeTimelineEvents: async function* () {},
      now: () => 10_000,
    });

    const loaded = await adapter.readTimeline(timelineQuery({
      filters: {
        ...timelineQuery().filters,
        activity: ["changes"],
        kinds: ["Deployment"],
        search: "checkout",
      },
    }));

    expect(loaded.coverage).toEqual([{
      scope: {
        workspaceId: "workspace-a",
        clusterId: "cluster-a",
        namespaces: ["payments"],
        freshness: "live",
      },
      source: "kubernetes_event",
      fromMs: 1_000,
      toMs: 2_000,
      reason: "collection_gap",
    }]);
  });

  it("keeps a coverage frame non-terminal and resumes from its opaque cursor", async () => {
    const streams = [
      streamOf(coverageFrame("opaque.coverage")),
      streamOf(errorFrame("opaque.coverage")),
    ];
    const subscriptions: Parameters<TimelineEndpointDependencies["subscribeTimelineEvents"]>[0][] = [];
    const subscribeTimelineEvents = vi.fn((input: Parameters<TimelineEndpointDependencies["subscribeTimelineEvents"]>[0]) => {
      subscriptions.push(input);
      return streams.shift() ?? streamOf(errorFrame("opaque.coverage"));
    });
    const adapter = createTimelineAdapter({
      getTimelineCapabilities: async () => capabilities(),
      getTimelineSnapshot: async () => snapshot("opaque.snapshot"),
      subscribeTimelineEvents,
      now: () => 10_000,
      random: () => 0,
    });
    const loaded = await adapter.readTimeline(timelineQuery());

    const frames = await collect(adapter.subscribeTimeline(loaded.session));

    expect(frames.map((frame) => frame.kind)).toEqual(["coverage", "error"]);
    expect(subscriptions[1]).toEqual(expect.objectContaining({
      after: { token: "opaque.coverage" },
    }));
  });
});

function timelineQuery(overrides: Partial<TimelineQuery> = {}): TimelineQuery {
  return {
    scopes: [{
      workspaceId: "workspace-a",
      clusterId: "cluster-a",
      namespaces: ["payments"],
      freshness: "live",
    }],
    mode: { kind: "live", widthMs: 1_000 },
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
    ...overrides,
  };
}

function snapshot(
  cursor: string,
  coverage: TimelineEndpointSnapshot["snapshot"]["coverage"] = [],
  descriptor = capabilities(),
): TimelineEndpointSnapshot {
  return {
    snapshot: {
      kind: "snapshot",
      cursor: { token: cursor },
      scopes: [{
        workspace_id: "workspace-a",
        cluster_id: "cluster-a",
        namespaces: ["payments"],
        freshness: "stale",
      }],
      policy: {
        max_batch_events: 100,
        max_frames_per_second: 30,
        retention_seconds: 86_400,
        resume: "cursor",
        hidden_tab: "coalesce",
        reconnect: {
          min_delay_ms: 100,
          max_delay_ms: 200,
          strategy: "full_jitter_exponential",
        },
        live_session: {
          max_age_ms: 30_000,
          strategy: "replace_with_snapshot",
        },
      },
      events: [event()],
      coverage,
      capabilities: descriptor,
    },
    end: { kind: "end", cursor: { token: cursor } },
  };
}

function capabilities(): TimelineEndpointCapabilityDescriptor {
  return {
    selected_source_mode: "retained",
    available_source_modes: ["retained"],
    max_retained_range_ms: 7_200_000,
    namespace_filter_policy: "not_required",
  };
}

function eventFrame(cursor: string): Extract<TimelineEndpointStreamFrame, { kind: "event" }> {
  return { kind: "event", cursor: { token: cursor }, event: event() };
}

function errorFrame(cursor: string): Extract<TimelineEndpointStreamFrame, { kind: "error" }> {
  return { kind: "error", cursor: { token: cursor }, reason: "fanout closed" };
}

function coverageFrame(cursor: string): Extract<TimelineEndpointStreamFrame, { kind: "coverage" }> {
  return {
    kind: "coverage",
    cursor: { token: cursor },
    coverage: [{
      scope: {
        workspace_id: "workspace-a",
        cluster_id: "cluster-a",
        namespaces: ["payments"],
        freshness: "live",
      },
      source: "kubernetes_event",
      from_ms: 1_000,
      to_ms: 2_000,
      reason: "collection_gap",
    }],
  };
}

function event() {
  const resource = {
    api_group: "apps",
    version: "v1",
    kind: "Deployment",
    namespace: "payments",
    name: "checkout",
    uid: "deployment-uid",
  };
  return {
    event_id: "event-1",
    source: "inventory" as const,
    source_key: "inventory:event-1",
    native_id: "event-1",
    activity: "change" as const,
    occurred_at: "2026-07-15T00:00:00Z",
    scope: {
      workspace_id: "workspace-a",
      cluster_id: "cluster-a",
      namespaces: ["payments"],
      freshness: "live" as const,
    },
    subject: { kind: "resource" as const, resource },
    resource,
    event_type: "update" as const,
    severity: "warning" as const,
    title: "Deployment checkout changed",
    owner: null,
    metadata: {},
  };
}

async function* streamOf(...frames: TimelineEndpointStreamFrame[]): AsyncIterable<TimelineEndpointStreamFrame> {
  yield* frames;
}

async function collect<T>(stream: AsyncIterable<T>): Promise<T[]> {
  const values: T[] = [];
  for await (const value of stream) values.push(value);
  return values;
}

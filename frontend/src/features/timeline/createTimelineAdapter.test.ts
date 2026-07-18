import { describe, expect, it, vi } from "vitest";

import { createTimelineAdapter, type TimelineAdapterDependencies } from "./createTimelineAdapter";
import type {
  TimelineEndpointDependencies,
  TimelineEndpointCapabilityDescriptor,
  TimelineEndpointOverview,
  TimelineEndpointPinMutation,
  TimelineEndpointPinSet,
  TimelineEndpointSnapshot,
  TimelineEndpointStreamFrame,
} from "./timelineEndpointContract";
import type { TimelineQuery } from "./timelineContract";

function endpointError(kind: string, message: string, status: number): Error & { kind: string; status: number } {
  return Object.assign(new Error(message), { kind, status });
}

describe("Timeline adapter", () => {
  it("does not publish a synchronous retained/local fallback before preflight", () => {
    const adapter = adapterFor({
      getTimelineCapabilities: async () => capabilities(),
      getTimelineSnapshot: async () => snapshot("opaque.snapshot"),
      subscribeTimelineEvents: async function* () {},
    });

    expect(() => adapter.capabilities).toThrowError(expect.objectContaining({
      code: "invalid-response",
      reason: "Timeline capabilities have not been bootstrapped.",
    }));
  });

  it.each([
    [401, "unauthorized"],
    [403, "forbidden"],
    [404, "not-found"],
  ] as const)("maps capability HTTP %i to the forbidden product state", async (status, kind) => {
    const adapter = adapterFor({
      getTimelineCapabilities: async () => {
        throw endpointError(kind, "hidden", status);
      },
      getTimelineSnapshot: async () => snapshot("opaque.snapshot"),
      subscribeTimelineEvents: async function* () {},
    });
    const readCapabilities = adapter.readCapabilities;
    if (readCapabilities === undefined) throw new Error("Timeline adapter must expose capability preflight");

    await expect(readCapabilities()).rejects.toMatchObject({ code: "forbidden" });
  });

  it("preflights one server capability descriptor before its first snapshot", async () => {
    const order: string[] = [];
    const adapter = adapterFor({
      getTimelineCapabilities: async () => {
        order.push("capabilities");
        return capabilities();
      },
      getTimelineSnapshot: async () => {
        order.push("snapshot");
        return snapshot("opaque.snapshot");
      },
      subscribeTimelineEvents: async function* () {},
    });

    await adapter.readTimeline(timelineQuery());
    const readCapabilities = adapter.readCapabilities;
    if (readCapabilities === undefined) throw new Error("Timeline adapter must expose capability preflight");

    expect(order).toEqual(["capabilities", "snapshot"]);
    const descriptor = expect.objectContaining({
      selectedSourceMode: "retained",
      availableSourceModes: ["retained"],
      maxRetainedRangeMs: 7_200_000,
      queryBounds: { serverNowMs: 10_000, earliestQueryableMs: 2_800, maxWindowMs: 7_200_000 },
      namespaceFilterPolicy: "not_required",
      controlSurface: expect.objectContaining({
        defaultTimeRangeId: "1h",
        customTimeRangeId: "custom",
        defaultLensZoomRung: "1h",
        pins: {
          key: "pins",
          label: "Pinned lanes",
          availability: "available",
          storage: "server",
          revision: "pin_set",
          subjectKinds: ["resource", "application"],
        },
      }),
    });
    await expect(readCapabilities()).resolves.toEqual(descriptor);
    expect(adapter.capabilities).toEqual(descriptor);
  });

  it("isolates cached descriptors when the workspace scope changes", async () => {
    const getTimelineCapabilities = vi.fn(async () => capabilities());
    const adapter = adapterFor({
      getTimelineCapabilities,
      getTimelineSnapshot: async () => snapshot("opaque.snapshot"),
      subscribeTimelineEvents: async function* () {},
    });

    await adapter.readTimeline(timelineQuery());
    await adapter.readTimeline(timelineQuery({
      scopes: [{
        workspaceId: "workspace-b",
        clusterId: "cluster-b",
        namespaces: [],
        freshness: "live",
      }],
    }));
    await adapter.readTimeline(timelineQuery());

    expect(getTimelineCapabilities).toHaveBeenCalledTimes(2);
  });

  it("fails closed when a snapshot descriptor differs from its preflight", async () => {
    const adapter = adapterFor({
      getTimelineCapabilities: async () => capabilities(),
      getTimelineSnapshot: async () => snapshot("opaque.snapshot", [], {
        ...capabilities(),
        namespace_filter_policy: "required",
      }),
      subscribeTimelineEvents: async function* () {},
    });

    await expect(adapter.readTimeline(timelineQuery())).rejects.toMatchObject({
      code: "invalid-response",
    });
  });

  it("accepts query bounds that advance between capability and snapshot reads", async () => {
    const advanced = capabilities();
    advanced.query_bounds = {
      ...advanced.query_bounds,
      server_now_ms: advanced.query_bounds.server_now_ms + 250,
      earliest_queryable_ms: advanced.query_bounds.earliest_queryable_ms + 250,
    };
    const adapter = adapterFor({
      getTimelineCapabilities: async () => capabilities(),
      getTimelineSnapshot: async () => snapshot("opaque.snapshot", [], advanced),
      subscribeTimelineEvents: async function* () {},
    });

    await expect(adapter.readTimeline(timelineQuery())).resolves.toMatchObject({
      session: { cursor: { token: "opaque.snapshot" } },
    });
  });

  it("fails closed when snapshot query bounds regress or change retention", async () => {
    const regressed = capabilities();
    regressed.query_bounds = {
      ...regressed.query_bounds,
      server_now_ms: regressed.query_bounds.server_now_ms - 1,
      earliest_queryable_ms: regressed.query_bounds.earliest_queryable_ms - 1,
    };
    const changedRetention = capabilities();
    changedRetention.query_bounds = {
      ...changedRetention.query_bounds,
      server_now_ms: changedRetention.query_bounds.server_now_ms + 250,
      earliest_queryable_ms: changedRetention.query_bounds.earliest_queryable_ms + 249,
    };

    for (const descriptor of [regressed, changedRetention]) {
      const adapter = adapterFor({
        getTimelineCapabilities: async () => capabilities(),
        getTimelineSnapshot: async () => snapshot("opaque.snapshot", [], descriptor),
        subscribeTimelineEvents: async function* () {},
      });

      await expect(adapter.readTimeline(timelineQuery())).rejects.toMatchObject({
        code: "invalid-response",
      });
    }
  });

  it("fails closed when a snapshot control catalog differs from preflight", async () => {
    const preflight = capabilities();
    const adapter = adapterFor({
      getTimelineCapabilities: async () => preflight,
      getTimelineSnapshot: async () => snapshot("opaque.snapshot", [], {
        ...preflight,
        control_surface: {
          ...preflight.control_surface,
          legend: { ...preflight.control_surface.legend, label: "Different legend" },
        },
      }),
      subscribeTimelineEvents: async function* () {},
    });

    await expect(adapter.readTimeline(timelineQuery())).rejects.toMatchObject({
      code: "invalid-response",
    });
  });

  it("maps URL activity keys, common scope fields, filters, and a finite live window", async () => {
    const getTimelineSnapshot = vi.fn().mockResolvedValue(snapshot("opaque.snapshot"));
    const adapter = adapterFor({
      getTimelineCapabilities: async () => capabilities(),
      getTimelineSnapshot,
      subscribeTimelineEvents: async function* () {},
    });
    const query = timelineQuery({
      filters: {
        ...timelineQuery().filters,
        activity: ["changes"],
        kinds: ["Deployment", "Pod"],
        pinnedOnly: false,
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
          activity: ["change"],
          kinds: ["Deployment", "Pod"],
          include_deleted: false,
          pinned_only: false,
          query: "checkout",
        },
        grouping: "owner",
        sort: "recent",
        mode: "live",
        view: "swimlane",
        range_id: "1h",
        lens_zoom_rung: "1h",
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
    const adapter = adapterFor({
      getTimelineCapabilities: async () => capabilities(),
      getTimelineSnapshot: async () => snapshot("opaque.snapshot"),
      subscribeTimelineEvents,
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
      getTimelineOverview: async () => overview(),
      getTimelinePins: async () => pinSet(),
      upsertTimelinePin: async () => emptyPinMutation(),
      removeTimelinePin: async () => emptyPinMutation(),
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

  it("keeps the opaque cursor when supported presentation preferences change", async () => {
    const subscribeTimelineEvents = vi.fn(() => streamOf(errorFrame("opaque.snapshot")));
    const adapter = adapterFor({
      getTimelineCapabilities: async () => capabilities(),
      getTimelineSnapshot: async () => snapshot("opaque.snapshot"),
      subscribeTimelineEvents,
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
          pinnedOnly: false,
        },
      },
    };

    await collect(adapter.subscribeTimeline(presentationOnly));

    expect(subscribeTimelineEvents).toHaveBeenCalledWith(expect.objectContaining({
      after: { token: "opaque.snapshot" },
      query: expect.objectContaining({
        grouping: "flat",
        sort: "name",
        filters: expect.objectContaining({ pinned_only: false }),
      }),
    }), expect.objectContaining({
      onLifecycle: expect.any(Function),
      signal: undefined,
    }));
  });

  it("maps server-authorized snapshot coverage without reapplying client filters", async () => {
    const adapter = adapterFor({
      getTimelineCapabilities: async () => capabilities(),
      getTimelineSnapshot: async () => snapshot("opaque.snapshot", [coverageFrame("opaque.coverage").coverage[0]!]),
      subscribeTimelineEvents: async function* () {},
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

  it("rejects unavailable pins before issuing a snapshot or stream request", async () => {
    const getTimelineSnapshot = vi.fn().mockResolvedValue(snapshot("opaque.snapshot"));
    const subscribeTimelineEvents = vi.fn(() => streamOf(errorFrame("opaque.snapshot")));
    const getTimelinePins = vi.fn().mockResolvedValue(pinSet());
    const available = capabilities();
    const unavailable = {
      ...available,
      control_surface: {
        ...available.control_surface,
        pins: {
          key: "pins" as const,
          label: "Pinned lanes",
          availability: "unavailable" as const,
          storage: null,
          revision: null,
          subject_kinds: [] as const,
        },
      },
    };
    const adapter = adapterFor({
      getTimelineCapabilities: async () => unavailable,
      getTimelineSnapshot,
      getTimelinePins,
      subscribeTimelineEvents,
    });
    const query = timelineQuery({
      filters: { ...timelineQuery().filters, pinnedOnly: true },
    });

    await expect(adapter.readTimeline(query)).rejects.toMatchObject({ code: "invalid-request" });
    expect(getTimelineSnapshot).not.toHaveBeenCalled();
    await expect(adapter.readTimelinePins(undefined, "workspace-a")).rejects.toMatchObject({
      code: "invalid-request",
    });
    expect(getTimelinePins).not.toHaveBeenCalled();

    getTimelineSnapshot.mockResolvedValue(snapshot("opaque.snapshot", [], unavailable));
    const loaded = await adapter.readTimeline(timelineQuery());
    await expect(collect(adapter.subscribeTimeline({ ...loaded.session, query }))).rejects.toMatchObject({
      code: "invalid-request",
    });
    expect(subscribeTimelineEvents).not.toHaveBeenCalled();
  });

  it("maps a server-owned overview without conflating unavailable coverage and zero gaps", async () => {
    const getTimelineOverview = vi.fn().mockResolvedValue(overview());
    const adapter = adapterFor({
      getTimelineCapabilities: async () => capabilities(),
      getTimelineSnapshot: async () => snapshot("opaque.snapshot"),
      getTimelineOverview,
      subscribeTimelineEvents: async function* () {},
    });

    const value = await adapter.readTimelineOverview(timelineQuery());

    expect(getTimelineOverview).toHaveBeenCalledWith({
      query: expect.objectContaining({
        view: "swimlane",
        range_id: "1h",
        lens_zoom_rung: "1h",
      }),
    }, undefined);
    expect(value).toEqual({
      window: { fromMs: 9_000, toMs: 10_000 },
      queryBounds: { serverNowMs: 10_000, earliestQueryableMs: 2_800, maxWindowMs: 7_200_000 },
      bucketWidthMs: 1_000,
      buckets: [{ fromMs: 9_000, toMs: 10_000, eventCount: 0, problemCount: 0 }],
      coverage: [],
      coverageSources: [
        { source: "inventory", availability: "unavailable" },
        { source: "kubernetes_event", availability: "observed" },
      ],
      facets: { activity: [{ activity: "change", count: 0 }], kinds: [] },
      newEvidenceCount: null,
      pinSetRevision: null,
    });
  });

  it.each([
    [401, "unauthorized", "forbidden"],
    [404, "not-found", "forbidden"],
    [422, "invalid-request", "invalid-response"],
    [503, "http", "unavailable"],
  ] as const)("maps overview HTTP %i to %s", async (status, kind, code) => {
    const adapter = adapterFor({
      getTimelineCapabilities: async () => capabilities(),
      getTimelineSnapshot: async () => snapshot("opaque.snapshot"),
      getTimelineOverview: async () => {
        throw endpointError(kind, "overview failed", status);
      },
      subscribeTimelineEvents: async function* () {},
    });

    await expect(adapter.readTimelineOverview(timelineQuery())).rejects.toMatchObject({ code });
  });

  it("maps persistent pin reads and revisions through the port without rendering a pin UI", async () => {
    const getTimelinePins = vi.fn().mockResolvedValue(populatedPinSet());
    const upsertTimelinePin = vi.fn().mockResolvedValue(pinMutation("added", 4));
    const removeTimelinePin = vi.fn().mockResolvedValue(pinMutation("deleted", 5));
    const adapter = adapterFor({
      getTimelineCapabilities: async () => capabilities(),
      getTimelineSnapshot: async () => snapshot("opaque.pinned", [], capabilities(), 3),
      getTimelinePins,
      upsertTimelinePin,
      removeTimelinePin,
      subscribeTimelineEvents: async function* () {},
    });
    const pinnedQuery = timelineQuery({
      filters: { ...timelineQuery().filters, pinnedOnly: true },
    });

    const loaded = await adapter.readTimeline(pinnedQuery);
    const pins = await adapter.readTimelinePins(undefined, "workspace-a");
    const added = await adapter.upsertTimelinePin({
      expectedRevision: 3,
      target: { kind: "application", applicationId: "app-checkout" },
    }, undefined, "workspace-a");
    const deleted = await adapter.removeTimelinePin("pin-resource", 4, undefined, "workspace-a");

    expect(loaded.pinSetRevision).toBe(3);
    expect(pins).toEqual({
      revision: 3,
      pins: [
        {
          pinId: "pin-resource",
          subject: {
            kind: "resource",
            scope: {
              workspaceId: "workspace-a",
              clusterId: "cluster-a",
              namespaces: ["payments"],
              freshness: "live",
            },
            resource: {
              apiGroup: "apps",
              version: "v1",
              kind: "Deployment",
              namespace: "payments",
              name: "checkout",
              uid: "deployment-uid",
            },
          },
          createdAt: "2026-07-16T00:00:00Z",
        },
        {
          pinId: "pin-application",
          subject: {
            kind: "application",
            applicationId: "app-checkout",
            snapshot: {
              name: "checkout",
              repositoryId: "repo-checkout",
              manifestPath: "deploy/checkout.yaml",
            },
          },
          createdAt: "2026-07-16T00:00:00Z",
        },
      ],
    });
    expect(upsertTimelinePin).toHaveBeenCalledWith({
      expected_revision: 3,
      target: { kind: "application", application_id: "app-checkout" },
    }, undefined);
    expect(removeTimelinePin).toHaveBeenCalledWith("pin-resource", 4, undefined);
    expect(added).toMatchObject({ action: "added", pinSet: { revision: 4 } });
    expect(deleted).toMatchObject({ action: "deleted", pinSet: { revision: 5 } });
  });

  it("maps a stale pin mutation conflict and pinned cursor rejection explicitly", async () => {
    const adapter = adapterFor({
      getTimelineCapabilities: async () => capabilities(),
      getTimelineSnapshot: async () => snapshot("opaque.pinned", [], capabilities(), 3),
      getTimelinePins: async () => {
        throw endpointError("http", "stale pin set", 409);
      },
      subscribeTimelineEvents: () => streamOf(),
    });

    await expect(adapter.readTimelinePins(undefined, "workspace-a")).rejects.toMatchObject({
      code: "conflict",
    });

    const replayAdapter = adapterFor({
      getTimelineCapabilities: async () => capabilities(),
      getTimelineSnapshot: async () => snapshot("opaque.pinned", [], capabilities(), 3),
      subscribeTimelineEvents: () => {
        throw endpointError("invalid-request", "stale pinned cursor", 422);
      },
    });
    const loaded = await replayAdapter.readTimeline(timelineQuery({
      filters: { ...timelineQuery().filters, pinnedOnly: true },
    }));

    await expect(collect(replayAdapter.subscribeTimeline(loaded.session))).rejects.toMatchObject({
      code: "invalid-response",
    });
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
    const adapter = adapterFor({
      getTimelineCapabilities: async () => capabilities(),
      getTimelineSnapshot: async () => snapshot("opaque.snapshot"),
      subscribeTimelineEvents,
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
    ...overrides,
  };
}

function snapshot(
  cursor: string,
  coverage: TimelineEndpointSnapshot["snapshot"]["coverage"] = [],
  descriptor = capabilities(),
  pinSetRevision: number | null = null,
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
      pin_set_revision: pinSetRevision,
      capabilities: descriptor,
    },
    end: { kind: "end", cursor: { token: cursor }, pin_set_revision: null },
  };
}

function capabilities(): TimelineEndpointCapabilityDescriptor {
  return {
    selected_source_mode: "retained",
    available_source_modes: ["retained"],
    max_retained_range_ms: 7_200_000,
    query_bounds: { server_now_ms: 10_000, earliest_queryable_ms: 2_800, max_window_ms: 7_200_000 },
    namespace_filter_policy: "not_required",
    control_surface: {
      views: [controlOption("list", "List"), controlOption("swimlane", "Swimlane")],
      groupings: [controlOption("app", "Application"), controlOption("owner", "Owner"), controlOption("flat", "None")],
      sorts: [controlOption("importance", "Importance"), controlOption("recent", "Recent"), controlOption("name", "Name")],
      activity: [
        { ...controlOption("all", "All"), activity: [], problems_activity: [] },
        { ...controlOption("changes", "Changes"), activity: ["change"], problems_activity: ["unhealthy"] },
        { ...controlOption("k8s_events", "Kubernetes events"), activity: ["k8s_event"], problems_activity: ["warning"] },
      ],
      deleted: { key: "include_deleted", label: "Show deleted", default: true },
      kinds: { key: "kinds", label: "Kinds", selection: "multi", empty_selection: "all" },
      time_ranges: [{ ...controlOption("1h", "1h"), duration_ms: 3_600_000 }],
      default_time_range_id: "1h",
      custom_time_range_id: "custom",
      lens_zoom_rungs: [{ ...controlOption("1h", "1h"), duration_ms: 3_600_000 }],
      default_lens_zoom_rung: "1h",
      legend: {
        key: "legend",
        label: "Legend",
        availability: "available",
        items: [controlOption("change", "Changes")],
      },
      pins: {
        key: "pins",
        label: "Pinned lanes",
        availability: "available",
        storage: "server",
        revision: "pin_set",
        subject_kinds: ["resource", "application"],
      },
    },
  };
}

function controlOption(id: string, label: string) {
  return { id, label, description: null };
}

function overview(): TimelineEndpointOverview {
  return {
    window: { from_ms: 9_000, to_ms: 10_000 },
    query_bounds: { server_now_ms: 10_000, earliest_queryable_ms: 2_800, max_window_ms: 7_200_000 },
    bucket_width_ms: 1_000,
    buckets: [{ from_ms: 9_000, to_ms: 10_000, event_count: 0, problem_count: 0 }],
    coverage: [],
    coverage_sources: [
      { source: "inventory", availability: "unavailable" },
      { source: "kubernetes_event", availability: "observed" },
    ],
    facets: { activity: [{ activity: "change", count: 0 }], kinds: [] },
    new_evidence_count: null,
    pin_set_revision: null,
  };
}

function pinSet() {
  return { revision: 0, pins: [] };
}

function emptyPinMutation() {
  return { action: "unchanged" as const, pin_set: pinSet() };
}

function populatedPinSet(): TimelineEndpointPinSet {
  return {
    revision: 3,
    pins: [
      {
        pin_id: "pin-resource",
        subject: {
          kind: "resource",
          scope: {
            workspace_id: "workspace-a",
            cluster_id: "cluster-a",
            namespaces: ["payments"],
            freshness: "live",
          },
          resource: {
            api_group: "apps",
            version: "v1",
            kind: "Deployment",
            namespace: "payments",
            name: "checkout",
            uid: "deployment-uid",
          },
        },
        created_at: "2026-07-16T00:00:00Z",
      },
      {
        pin_id: "pin-application",
        subject: {
          kind: "application",
          application_id: "app-checkout",
          snapshot: {
            name: "checkout",
            repository_id: "repo-checkout",
            manifest_path: "deploy/checkout.yaml",
          },
        },
        created_at: "2026-07-16T00:00:00Z",
      },
    ],
  };
}

function pinMutation(
  action: "added" | "deleted",
  revision: number,
): TimelineEndpointPinMutation {
  return { action, pin_set: { ...populatedPinSet(), revision } };
}

function adapterFor(
  dependencies: Omit<
    TimelineAdapterDependencies,
    "getTimelineOverview" | "getTimelinePins" | "upsertTimelinePin" | "removeTimelinePin"
  > & {
    getTimelineOverview?: TimelineAdapterDependencies["getTimelineOverview"];
    getTimelinePins?: TimelineAdapterDependencies["getTimelinePins"];
    upsertTimelinePin?: TimelineAdapterDependencies["upsertTimelinePin"];
    removeTimelinePin?: TimelineAdapterDependencies["removeTimelinePin"];
  },
) {
  return createTimelineAdapter({
    ...dependencies,
    getTimelineOverview: dependencies.getTimelineOverview ?? (async () => overview()),
    getTimelinePins: dependencies.getTimelinePins ?? (async () => pinSet()),
    upsertTimelinePin: dependencies.upsertTimelinePin ?? (async () => emptyPinMutation()),
    removeTimelinePin: dependencies.removeTimelinePin ?? (async () => emptyPinMutation()),
  });
}

function eventFrame(cursor: string): Extract<TimelineEndpointStreamFrame, { kind: "event" }> {
  return { kind: "event", cursor: { token: cursor }, event: event(), pin_set_revision: null };
}

function errorFrame(cursor: string): Extract<TimelineEndpointStreamFrame, { kind: "error" }> {
  return { kind: "error", cursor: { token: cursor }, reason: "fanout closed", pin_set_revision: null };
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
    pin_set_revision: null,
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

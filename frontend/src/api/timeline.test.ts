import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  getTimelineCapabilities,
  getTimelineOverview,
  getTimelinePins,
  getTimelineSnapshot,
  removeTimelinePin,
  subscribeTimelineEvents,
  upsertTimelinePin,
} from "./timeline";

const request = {
  query: {
    scopes: [{
      workspace_id: "workspace-a",
      cluster_id: "cluster-a",
      namespaces: ["payments"],
      freshness: "live" as const,
    }],
    window: { from_ms: 1_000, to_ms: 2_000 },
    mode: "live" as const,
    filters: {
      activity: ["change" as const],
      kinds: ["Deployment"],
      include_deleted: true,
      pinned_only: false,
      query: "checkout",
    },
    grouping: "app" as const,
    sort: "recent" as const,
    view: "swimlane",
    range_id: "1h",
    lens_zoom_rung: "1h",
  },
};

describe("Timeline API transport", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("gets one strict server-owned capability descriptor before a Timeline query", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(
      JSON.stringify(capabilityDescriptor()),
      { headers: { "content-type": "application/json" } },
    ));

    await expect(getTimelineCapabilities()).resolves.toEqual(capabilityDescriptor());

    const [path, init] = fetchMock.mock.calls[0] ?? [];
    expect(path).toBe("/api/timeline/capabilities");
    expect(init).toMatchObject({ credentials: "include", method: "GET" });
    expect(new Headers(init?.headers).get("accept")).toBe("application/json");
    expect(new Headers(init?.headers).get("x-service-csrf")).toBeNull();
  });

  it("fails closed when the capability descriptor selects an unavailable source", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
      ...capabilityDescriptor(),
      selected_source_mode: "local",
    }), { headers: { "content-type": "application/json" } }));

    await expect(getTimelineCapabilities()).rejects.toMatchObject({ kind: "invalid-payload" });
  });

  it("fails closed when the capability descriptor repeats a source mode", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
      ...capabilityDescriptor(),
      available_source_modes: ["retained", "retained"],
    }), { headers: { "content-type": "application/json" } }));

    await expect(getTimelineCapabilities()).rejects.toMatchObject({ kind: "invalid-payload" });
  });

  it("posts and strictly decodes a retained NDJSON snapshot", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response([
      JSON.stringify(snapshotFrame()),
      JSON.stringify({ kind: "end", cursor: { token: "opaque.snapshot" }, pin_set_revision: null }),
      "",
    ].join("\n"), {
      headers: { "content-type": "application/x-ndjson; charset=utf-8" },
    }));

    const snapshot = await getTimelineSnapshot(request);

    expect(snapshot.snapshot.events[0]?.title).toBe("Deployment checkout changed");
    expect(snapshot.snapshot.policy.reconnect).toEqual({
      min_delay_ms: 500,
      max_delay_ms: 30_000,
      strategy: "full_jitter_exponential",
    });
    const [path, init] = fetchMock.mock.calls[0] ?? [];
    expect(path).toBe("/api/timeline/snapshots");
    expect(init).toMatchObject({ credentials: "include", method: "POST" });
    const headers = new Headers(init?.headers);
    expect(headers.get("accept")).toBe("application/x-ndjson");
    expect(headers.get("content-type")).toBe("application/json");
    expect(headers.get("x-service-csrf")).toBe("same-origin");
    expect(JSON.parse(String(init?.body))).toEqual(request);
  });

  it("posts a typed overview aggregate and preserves unavailable coverage separately from zero gaps", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(
      JSON.stringify(overview()),
      { headers: { "content-type": "application/json" } },
    ));

    await expect(getTimelineOverview(request)).resolves.toEqual(overview());

    const [path, init] = fetchMock.mock.calls[0] ?? [];
    expect(path).toBe("/api/timeline/overview");
    expect(init).toMatchObject({ credentials: "include", method: "POST" });
    expect(JSON.parse(String(init?.body))).toEqual(request);
  });

  it("uses strict server pin-set routes with CSRF and an encoded optimistic revision", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify(pinSet()), {
        headers: { "content-type": "application/json" },
      }))
      .mockResolvedValueOnce(new Response(JSON.stringify(pinMutation("added")), {
        headers: { "content-type": "application/json" },
      }))
      .mockResolvedValueOnce(new Response(JSON.stringify(pinMutation("deleted")), {
        headers: { "content-type": "application/json" },
      }));

    await expect(getTimelinePins()).resolves.toEqual(pinSet());
    await expect(upsertTimelinePin(pinUpsert())).resolves.toEqual(pinMutation("added"));
    await expect(removeTimelinePin("pin/resource 1", 3)).resolves.toEqual(pinMutation("deleted"));

    const [getPath, getInit] = fetchMock.mock.calls[0] ?? [];
    expect(getPath).toBe("/api/timeline/pins");
    expect(getInit).toMatchObject({ credentials: "include", method: "GET" });
    expect(new Headers(getInit?.headers).get("x-service-csrf")).toBeNull();

    const [putPath, putInit] = fetchMock.mock.calls[1] ?? [];
    expect(putPath).toBe("/api/timeline/pins");
    expect(putInit).toMatchObject({ credentials: "include", method: "PUT" });
    expect(new Headers(putInit?.headers).get("x-service-csrf")).toBe("same-origin");
    expect(JSON.parse(String(putInit?.body))).toEqual(pinUpsert());

    const [deletePath, deleteInit] = fetchMock.mock.calls[2] ?? [];
    expect(deletePath).toBe("/api/timeline/pins/pin%2Fresource%201?expected_revision=3");
    expect(deleteInit).toMatchObject({ credentials: "include", method: "DELETE" });
    expect(new Headers(deleteInit?.headers).get("x-service-csrf")).toBe("same-origin");
  });

  it("fails closed when an available pin capability omits its persistence discriminator", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
      ...capabilityDescriptor(),
      control_surface: {
        ...capabilityDescriptor().control_surface,
        pins: { key: "pins", label: "Pinned lanes", availability: "available" },
      },
    }), { headers: { "content-type": "application/json" } }));

    await expect(getTimelineCapabilities()).rejects.toMatchObject({ kind: "invalid-payload" });
  });

  it("fails closed when an NDJSON snapshot has an untrusted terminal shape", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response([
      JSON.stringify(snapshotFrame()),
      JSON.stringify({ kind: "end", cursor: { token: "other-token" }, pin_set_revision: null }),
      "",
    ].join("\n"), {
      headers: { "content-type": "application/x-ndjson" },
    }));

    await expect(getTimelineSnapshot(request)).rejects.toMatchObject({ kind: "invalid-payload" });
  });

  it("fails closed when an NDJSON snapshot descriptor violates bootstrap invariants", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response([
      JSON.stringify({
        ...snapshotFrame(),
        capabilities: {
          ...capabilityDescriptor(),
          selected_source_mode: "local",
        },
      }),
      JSON.stringify({ kind: "end", cursor: { token: "opaque.snapshot" }, pin_set_revision: null }),
      "",
    ].join("\n"), {
      headers: { "content-type": "application/x-ndjson" },
    }));

    await expect(getTimelineSnapshot(request)).rejects.toMatchObject({ kind: "invalid-payload" });
  });

  it("uses POST Fetch-SSE with matching body and Last-Event-ID opaque cursors", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response([
      `id: opaque.next\nevent: event\ndata: ${JSON.stringify(eventFrame("opaque.next"))}`,
      `id: opaque.next\nevent: error\ndata: ${JSON.stringify({
        kind: "error",
        cursor: { token: "opaque.next" },
        reason: "fanout closed",
        pin_set_revision: null,
      })}`,
      "",
    ].join("\n\n"), {
      headers: { "content-type": "text/event-stream" },
    }));

    const frames: unknown[] = [];
    for await (const frame of subscribeTimelineEvents({ ...request, after: { token: "opaque.snapshot" } })) {
      frames.push(frame);
    }

    expect(frames).toHaveLength(2);
    const [path, init] = fetchMock.mock.calls[0] ?? [];
    expect(path).toBe("/api/timeline/stream");
    expect(init).toMatchObject({ credentials: "include", method: "POST" });
    expect(new Headers(init?.headers).get("last-event-id")).toBe("opaque.snapshot");
    expect(JSON.parse(String(init?.body))).toEqual({ ...request, after: { token: "opaque.snapshot" } });
  });

  it("accepts a coverage delta without ending the live SSE connection", async () => {
    const coverageRequest = {
      ...request,
      query: {
        ...request.query,
        filters: {
          ...request.query.filters,
          activity: ["k8s_event" as const],
          kinds: ["Event"],
          query: "",
        },
      },
    };
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response([
      `id: opaque.coverage\nevent: coverage\ndata: ${JSON.stringify(coverageFrame("opaque.coverage"))}`,
      `id: opaque.event\nevent: event\ndata: ${JSON.stringify(eventFrame("opaque.event"))}`,
      `id: opaque.event\nevent: error\ndata: ${JSON.stringify({
        kind: "error",
        cursor: { token: "opaque.event" },
        reason: "fanout closed",
        pin_set_revision: null,
      })}`,
      "",
    ].join("\n\n"), {
      headers: { "content-type": "text/event-stream" },
    }));

    const frames: { kind: string; cursor: { token: string } }[] = [];
    for await (const frame of subscribeTimelineEvents({
      ...coverageRequest,
      after: { token: "opaque.snapshot" },
    })) {
      frames.push(frame);
    }

    expect(frames.map((frame) => frame.kind)).toEqual(["coverage", "event", "error"]);
    expect(frames[0]?.cursor.token).toBe("opaque.coverage");
    expect(frames[1]?.cursor.token).toBe("opaque.event");
  });

  it("rejects an SSE frame when its event name or opaque ID disagrees with the decoded frame", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(
      `id: opaque.other\nevent: event\ndata: ${JSON.stringify(eventFrame("opaque.next"))}\n\n`,
      { headers: { "content-type": "text/event-stream" } },
    ));

    const iterator = subscribeTimelineEvents({ ...request, after: { token: "opaque.snapshot" } })[Symbol.asyncIterator]();
    await expect(iterator.next()).rejects.toMatchObject({ kind: "invalid-payload" });
  });
});

function snapshotFrame() {
  return {
    kind: "snapshot",
    cursor: { token: "opaque.snapshot" },
    scopes: [{ workspace_id: "workspace-a", cluster_id: "cluster-a" }],
    policy: {
      max_batch_events: 100,
      max_frames_per_second: 30,
      retention_seconds: 86_400,
      resume: "cursor",
      hidden_tab: "coalesce",
      reconnect: {
        min_delay_ms: 500,
        max_delay_ms: 30_000,
        strategy: "full_jitter_exponential",
      },
      live_session: {
        max_age_ms: 30_000,
        strategy: "replace_with_snapshot",
      },
    },
    capabilities: capabilityDescriptor(),
    events: [event()],
    pin_set_revision: null,
  };
}

function capabilityDescriptor() {
  return {
    selected_source_mode: "retained",
    available_source_modes: ["retained"],
    max_retained_range_ms: 7_200_000,
    namespace_filter_policy: "not_required",
    control_surface: {
      views: [controlOption("list", "List"), controlOption("swimlane", "Swimlane")],
      groupings: [controlOption("app", "Application"), controlOption("owner", "Owner"), controlOption("flat", "None")],
      sorts: [controlOption("importance", "Importance"), controlOption("recent", "Recent"), controlOption("name", "Name")],
      activity: [
        { ...controlOption("all", "All"), activity: [], problems_activity: ["unhealthy", "warning"] },
        { ...controlOption("changes", "Changes"), activity: ["change"], problems_activity: ["unhealthy"] },
        { ...controlOption("k8s_events", "K8s Events"), activity: ["k8s_event"], problems_activity: ["warning"] },
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

function overview() {
  return {
    window: { from_ms: 1_000, to_ms: 2_000 },
    bucket_width_ms: 1_000,
    buckets: [{ from_ms: 1_000, to_ms: 2_000, event_count: 0, problem_count: 0 }],
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

function pinUpsert() {
  return {
    expected_revision: 3,
    target: {
      kind: "resource" as const,
      scope: {
        workspace_id: "workspace-a",
        cluster_id: "cluster-a",
        namespaces: ["payments"],
        freshness: "live" as const,
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
  };
}

function pinSet() {
  return {
    revision: 3,
    pins: [
      {
        pin_id: "pin-resource",
        subject: pinUpsert().target,
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

function pinMutation(action: "added" | "deleted") {
  return { action, pin_set: pinSet() };
}

function eventFrame(cursor: string) {
  return { kind: "event", cursor: { token: cursor }, event: event(), pin_set_revision: null };
}

function coverageFrame(cursor: string) {
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
    source: "inventory",
    source_key: "inventory:event-1",
    native_id: "event-1",
    activity: "change",
    occurred_at: "2026-07-15T00:00:00Z",
    scope: { workspace_id: "workspace-a", cluster_id: "cluster-a" },
    subject: { kind: "resource", resource },
    resource,
    event_type: "update",
    severity: "warning",
    title: "Deployment checkout changed",
  };
}

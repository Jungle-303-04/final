import { beforeEach, describe, expect, it, vi } from "vitest";

import { getTimelineSnapshot, subscribeTimelineEvents } from "./timeline";

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
  },
};

describe("Timeline API transport", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("posts and strictly decodes a retained NDJSON snapshot", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response([
      JSON.stringify(snapshotFrame()),
      JSON.stringify({ kind: "end", cursor: { token: "opaque.snapshot" } }),
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

  it("fails closed when an NDJSON snapshot has an untrusted terminal shape", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response([
      JSON.stringify(snapshotFrame()),
      JSON.stringify({ kind: "end", cursor: { token: "other-token" } }),
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
    events: [event()],
  };
}

function eventFrame(cursor: string) {
  return { kind: "event", cursor: { token: cursor }, event: event() };
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

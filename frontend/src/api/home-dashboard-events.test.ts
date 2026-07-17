import { beforeEach, describe, expect, it, vi } from "vitest";

import { subscribeHomeDashboardEvents } from "./home-dashboard-events";

describe("Home dashboard event API", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("streams strict scoped completion frames and resumes with the opaque SSE cursor", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(sseResponse([
      frame("connected", "cursor-1"),
      frame("deferred_ready", "cursor-2", "snapshot-2"),
    ]));

    const received = [];
    for await (const event of subscribeHomeDashboardEvents("cluster/one", {
      after: "cursor-1",
    })) received.push(event);

    expect(received.map((event) => event.kind)).toEqual(["connected", "deferred_ready"]);
    expect(received[1]?.snapshot_id).toBe("snapshot-2");
    const [path, init] = fetchMock.mock.calls[0] ?? [];
    expect(path).toBe("/api/clusters/cluster%2Fone/home/events");
    expect(new Headers(init?.headers).get("last-event-id")).toBe("cursor-1");
    expect(init).toMatchObject({ credentials: "include", method: "GET" });
  });

  it("fails closed when SSE metadata disagrees with the typed frame", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(
      `id: wrong\nevent: heartbeat\ndata: ${JSON.stringify(frame("connected", "cursor-1"))}\n\n`,
      { headers: { "content-type": "text/event-stream" } },
    ));

    const iterator = subscribeHomeDashboardEvents("cluster-a")[Symbol.asyncIterator]();
    await expect(iterator.next()).rejects.toMatchObject({ kind: "invalid-payload" });
  });
});

function frame(
  kind: "connected" | "deferred_ready" | "heartbeat",
  cursor: string,
  snapshotId?: string,
) {
  return {
    kind,
    cursor,
    scope: {
      workspace_id: "workspace-a",
      cluster_id: "cluster/one",
      namespaces: [],
      freshness: "live",
    },
    reconnect_after_ms: 1_500,
    ...(snapshotId === undefined ? {} : {
      snapshot_id: snapshotId,
      occurred_at: "2026-07-17T01:02:03Z",
    }),
  };
}

function sseResponse(frames: readonly ReturnType<typeof frame>[]): Response {
  return new Response(frames.map((item) => [
    `id: ${item.cursor}`,
    `event: ${item.kind}`,
    `retry: ${item.reconnect_after_ms}`,
    `data: ${JSON.stringify(item)}`,
    "",
    "",
  ].join("\n")).join(""), {
    headers: { "content-type": "text/event-stream; charset=utf-8" },
  });
}

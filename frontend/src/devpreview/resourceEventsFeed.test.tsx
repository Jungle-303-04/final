// @vitest-environment jsdom
import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useResourceEvents } from "./resourceEventsFeed";

const resource = {
  inventory_key: "event-1", snapshot_id: "snapshot-1", workspace_id: "ws", cluster_id: "game-server",
  resource_type: "event", api_version: "v1", kind: "Event", namespace: "shop", name: "BackOff",
  uid: "uid", resource_version: "1", status: "Warning", health: "degraded", labels: {}, annotations: {},
  summary: { reason: "BackOff", message: "container restart", count: 2, last_timestamp: "2026-07-21T00:00:00Z" },
  observed_at: "2026-07-21T00:00:00Z", first_seen_at: null, last_seen_at: null, deleted_at: null,
  created_at: null, updated_at: null,
};

describe("resource events feed", () => {
  afterEach(() => vi.restoreAllMocks());

  it("loads involved-object events from resource-detail", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
      cluster_id: "game-server", identity: {}, resource: { ...resource, kind: "Pod", resource_type: "pod", name: "checkout-1" }, provider_detail: null, access: null, related: {}, events: [resource],
    }), { status: 200, headers: { "content-type": "application/json" } }));
    const rendered = renderHook(() => useResourceEvents("game-server", "Pod", "shop", "checkout-1"));
    await waitFor(() => expect(rendered.result.current.status).toBe("ready"));
    expect(rendered.result.current.items[0]).toMatchObject({ reason: "BackOff", count: 2 });
    expect(fetchMock.mock.calls[0]?.[0]).toContain("resource-detail?resource_type=pod&kind=Pod&name=checkout-1&namespace=shop");
  });

  it("does not request without a cluster identity", () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    const rendered = renderHook(() => useResourceEvents(null, "Node", null, "node-a"));
    expect(rendered.result.current.status).toBe("idle");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

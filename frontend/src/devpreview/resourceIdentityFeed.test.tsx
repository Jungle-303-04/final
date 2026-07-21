// @vitest-environment jsdom
import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useResourceIdentity } from "./resourceIdentityFeed";

const resource = {
  inventory_key: "inventory/deployment/shop/checkout",
  snapshot_id: "snapshot-1", workspace_id: "ws", cluster_id: "game-server",
  resource_type: "workload", api_version: "apps/v1", kind: "Deployment", namespace: "shop",
  name: "checkout", uid: "uid", resource_version: "1", status: "Ready", health: "healthy",
  labels: {}, annotations: {}, summary: {}, observed_at: "2026-07-21T00:00:00Z",
  first_seen_at: null, last_seen_at: null, deleted_at: null, created_at: null, updated_at: null,
};

describe("resource identity feed", () => {
  afterEach(() => vi.restoreAllMocks());

  it("resolves the inventory key from exact topology identity", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
      cluster_id: "game-server", identity: {}, resource, provider_detail: null, access: null,
      related: {}, events: [],
    }), { status: 200, headers: { "content-type": "application/json" } }));
    const rendered = renderHook(() => useResourceIdentity(
      true, "game-server", "workload", "Deployment", "shop", "checkout",
    ));
    await waitFor(() => expect(rendered.result.current.status).toBe("ready"));
    expect(rendered.result.current.resourceId).toBe(resource.inventory_key);
    expect(fetchMock.mock.calls[0]?.[0]).toContain(
      "resource-detail?resource_type=workload&kind=Deployment&name=checkout&namespace=shop",
    );
  });

  it("never requests when an inventory key already exists", () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    const rendered = renderHook(() => useResourceIdentity(
      false, "game-server", "workload", "Deployment", "shop", "checkout",
    ));
    expect(rendered.result.current).toEqual({ status: "idle", resourceId: "" });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

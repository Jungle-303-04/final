import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "./client";
import { listInventoryEvents } from "./inventory-events";

const EVENTS = {
  cluster_id: "cluster-1",
  resource_type: "event",
  resources: [
    {
      inventory_key: "event/default/api-backoff",
      snapshot_id: "snapshot-123",
      workspace_id: "default",
      cluster_id: "cluster-1",
      resource_type: "event",
      api_version: "v1",
      kind: "Event",
      namespace: "default",
      name: "api-backoff",
      uid: "event-123",
      resource_version: "42",
      status: "Warning",
      health: "warning",
      labels: {},
      annotations: {},
      summary: {
        reason: "BackOff",
        message: "Back-off restarting failed container",
        involved_kind: "Pod",
        involved_name: "api-abc",
      },
      observed_at: "2026-07-12T10:30:00Z",
      first_seen_at: "2026-07-12T10:25:00Z",
      last_seen_at: "2026-07-12T10:30:00Z",
      deleted_at: null,
      created_at: "2026-07-12T10:25:00Z",
      updated_at: "2026-07-12T10:30:00Z",
    },
  ],
};

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("inventory events API", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("lists Kubernetes events with namespace and bounded limit filters", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse(EVENTS));

    await expect(
      listInventoryEvents("cluster/one", { namespace: "default", limit: 100 }),
    ).resolves.toEqual(EVENTS);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/clusters/cluster%2Fone/inventory/events?namespace=default&limit=100",
      expect.objectContaining({ method: "GET", credentials: "include" }),
    );
  });

  it("uses the backend default limit when no options are provided", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse({ cluster_id: "cluster-1", resource_type: "event", resources: [] }),
    );

    await listInventoryEvents("cluster-1");

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/clusters/cluster-1/inventory/events?limit=200",
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("throws on an out-of-range event limit before making a request", () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");

    expect(() => listInventoryEvents("cluster-1", { limit: 1001 })).toThrow(
      "event limit must be an integer from 1 to 1000",
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects malformed event rows", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse({ ...EVENTS, resources: [{ ...EVENTS.resources[0], name: 123 }] }),
    );

    await expect(listInventoryEvents("cluster-1")).rejects.toMatchObject({
      kind: "invalid-payload",
      status: 200,
    } satisfies Partial<ApiError>);
  });

  it("preserves a forbidden response as a forbidden API error", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse({ detail: "Cluster access denied" }, 403),
    );

    await expect(listInventoryEvents("cluster-1")).rejects.toMatchObject({
      kind: "forbidden",
      status: 403,
      detail: "Cluster access denied",
    } satisfies Partial<ApiError>);
  });
});

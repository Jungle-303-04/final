import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "./client";
import { getInventorySummary } from "./inventory-summary";

const INVENTORY_SUMMARY = {
  cluster_id: "prod-seoul-01",
  latest_snapshot: {
    snapshot_id: "snapshot-123",
    collected_at: "2026-07-12T10:30:00Z",
    status: "completed",
  },
  counts: [
    { resource_type: "pod", health: "healthy", count: 42 },
    { resource_type: "pod", health: "warning", count: 3 },
    { resource_type: "node", health: "healthy", count: 3 },
  ],
  namespaces: [
    {
      namespace: "storefront",
      total: 45,
      counts: [
        { resource_type: "pod", health: "healthy", count: 42 },
        { resource_type: "pod", health: "warning", count: 3 },
      ],
    },
  ],
  counts_evidence: {
    completeness: "observed",
    observed_at: "2026-07-12T10:30:00Z",
    namespace_scope: [],
    reason_codes: [],
    forbidden: [],
  },
};

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("inventory summary API", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("loads the latest snapshot and resource counts", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse(INVENTORY_SUMMARY),
    );

    await expect(
      getInventorySummary("prod/seoul-01"),
    ).resolves.toEqual(INVENTORY_SUMMARY);
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/clusters/prod%2Fseoul-01/inventory/summary",
      expect.objectContaining({ credentials: "include", method: "GET" }),
    );
  });

  it("allows a cluster with no collected snapshot yet", async () => {
    const emptySummary = {
      cluster_id: "new-cluster",
      latest_snapshot: null,
      counts: [],
      namespaces: [],
      counts_evidence: {
        completeness: "unavailable",
        observed_at: null,
        namespace_scope: [],
        reason_codes: [],
        forbidden: [],
      },
    };
    vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse(emptySummary));

    await expect(getInventorySummary("new-cluster")).resolves.toEqual(emptySummary);
  });

  it("rejects a response with an invalid counts collection", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse({ ...INVENTORY_SUMMARY, counts: { pod: 45 } }),
    );

    await expect(getInventorySummary("prod-seoul-01")).rejects.toMatchObject({
      kind: "invalid-payload",
      status: 200,
    } satisfies Partial<ApiError>);
  });

  it("preserves a forbidden response as a forbidden API error", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse({ detail: "Cluster access denied" }, 403),
    );

    await expect(getInventorySummary("prod-seoul-01")).rejects.toMatchObject({
      kind: "forbidden",
      status: 403,
      detail: "Cluster access denied",
    } satisfies Partial<ApiError>);
  });
});

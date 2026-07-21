import { afterEach, describe, expect, it, vi } from "vitest";

import {
  getSharedInventorySummary,
  resetInventorySummaryRequestsForTests,
} from "./inventorySummaryFeed";

describe("getSharedInventorySummary", () => {
  afterEach(() => {
    resetInventorySummaryRequestsForTests();
    vi.restoreAllMocks();
  });

  it("deduplicates simultaneous Home widget projections per cluster", async () => {
    let release!: (response: Response) => void;
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(() =>
      new Promise<Response>((resolve) => { release = resolve; }),
    );

    const counts = getSharedInventorySummary("cluster-a");
    const namespaces = getSharedInventorySummary("cluster-a");
    expect(fetchMock).toHaveBeenCalledTimes(1);

    release(jsonResponse(summary("cluster-a")));
    await expect(Promise.all([counts, namespaces])).resolves.toEqual([
      summary("cluster-a"),
      summary("cluster-a"),
    ]);
  });

  it("does not merge requests from different clusters", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
      const clusterId = String(input).includes("cluster-b") ? "cluster-b" : "cluster-a";
      return Promise.resolve(jsonResponse(summary(clusterId)));
    });

    const [first, second] = await Promise.all([
      getSharedInventorySummary("cluster-a"),
      getSharedInventorySummary("cluster-b"),
    ]);
    expect(first.cluster_id).toBe("cluster-a");
    expect(second.cluster_id).toBe("cluster-b");
  });
});

function summary(clusterId: string) {
  return {
    cluster_id: clusterId,
    latest_snapshot: null,
    counts: [],
    namespaces: [],
    counts_evidence: {
      completeness: "observed",
      observed_at: "2026-07-21T08:00:00Z",
      namespace_scope: [],
      reason_codes: [],
      forbidden: [],
    },
  };
}

function jsonResponse(payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

import { beforeEach, describe, expect, it, vi } from "vitest";

import { getActivityOverview } from "./activity-overview";

describe("activity overview API", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("requests the exact server aggregate window", async () => {
    const payload = {
      from_ms: 0,
      to_ms: 86_400_000,
      bucket_ms: 86_400_000,
      buckets: [{
        from_ms: 0,
        to_ms: 86_400_000,
        deployments: 2,
        alerts: 3,
        critical: 1,
      }],
    };
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify(payload), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );

    await expect(getActivityOverview({
      applications: ["checkout"],
      fromMs: 0,
      toMs: 86_400_000,
      bucketMs: 86_400_000,
      clusterIds: ["cluster-1"],
      namespaces: ["shop"],
    })).resolves.toEqual(payload);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/activity/overview?from=0&to=86400000&bucket=86400000&clusters=cluster-1&namespaces=shop&applications=checkout",
      expect.objectContaining({ credentials: "include", method: "GET" }),
    );
  });

  it("rejects gaps instead of drawing a misleading line", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({
        from_ms: 0,
        to_ms: 180_000,
        bucket_ms: 60_000,
        buckets: [
          { from_ms: 0, to_ms: 60_000, deployments: 0, alerts: 0, critical: 0 },
          { from_ms: 120_000, to_ms: 180_000, deployments: 0, alerts: 0, critical: 0 },
        ],
      }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );

    await expect(getActivityOverview({
      fromMs: 0,
      toMs: 180_000,
      bucketMs: 60_000,
    })).rejects.toMatchObject({ kind: "invalid-payload" });
  });
});

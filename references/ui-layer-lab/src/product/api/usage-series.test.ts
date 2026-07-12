import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "./client";
import { getClusterResourceUsageSeries } from "./usage-series";

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("resource usage series API", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("extracts one Pod history from raw usage samples", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse({
        cluster_id: "cluster-1",
        samples: [
          {
            sampled_at: "2026-07-12T10:00:00Z",
            usage: {
              pods: {
                "default/api-abc": { cpu_mcores: 120, mem_mib: 256 },
                "default/web-xyz": { cpu_mcores: 80, mem_mib: 180 },
              },
            },
          },
          {
            sampled_at: "2026-07-12T10:05:00Z",
            usage: {
              pods: {
                "default/api-abc": { cpu_mcores: 150, mem_mib: 280 },
              },
            },
          },
        ],
      }),
    );

    await expect(
      getClusterResourceUsageSeries("cluster/one", {
        resourceType: "pod",
        namespace: "default",
        name: "api-abc",
      }),
    ).resolves.toEqual({
      clusterId: "cluster-1",
      resourceType: "pod",
      namespace: "default",
      name: "api-abc",
      points: [
        {
          sampledAt: "2026-07-12T10:00:00Z",
          cpuMcores: 120,
          memMib: 256,
          cpuPct: null,
          memPct: null,
        },
        {
          sampledAt: "2026-07-12T10:05:00Z",
          cpuMcores: 150,
          memMib: 280,
          cpuPct: null,
          memPct: null,
        },
      ],
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/clusters/cluster%2Fone/usage?limit=288",
      expect.objectContaining({ method: "GET", credentials: "include" }),
    );
  });

  it("extracts a Node history with percentage metrics", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse({
        cluster_id: "cluster-1",
        samples: [
          {
            sampled_at: "2026-07-12T10:00:00Z",
            usage: { nodes: { "worker-01": { cpu_pct: 40, mem_pct: 62 } } },
          },
        ],
      }),
    );

    await expect(
      getClusterResourceUsageSeries("cluster-1", {
        resourceType: "node",
        name: "worker-01",
      }),
    ).resolves.toMatchObject({
      resourceType: "node",
      namespace: null,
      name: "worker-01",
      points: [{ cpuMcores: null, memMib: null, cpuPct: 40, memPct: 62 }],
    });
  });

  it("uses null when the selected resource has no observation", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse({
        cluster_id: "cluster-1",
        samples: [{ sampled_at: null, usage: { pods: {} } }],
      }),
    );

    const series = await getClusterResourceUsageSeries("cluster-1", {
      resourceType: "pod",
      namespace: "default",
      name: "missing",
    });

    expect(series.points).toEqual([
      {
        sampledAt: null,
        cpuMcores: null,
        memMib: null,
        cpuPct: null,
        memPct: null,
      },
    ]);
  });

  it("rejects an out-of-range limit before opening the transport", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");

    await expect(
      getClusterResourceUsageSeries(
        "cluster-1",
        { resourceType: "node", name: "worker-1" },
        { limit: 2_001 },
      ),
    ).rejects.toBeInstanceOf(RangeError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects top-level response drift while preserving the open usage map", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse({
        cluster_id: "cluster-1",
        samples: [{ sampled_at: null, usage: { future_metric: 1 } }],
        unexpected: true,
      }),
    );

    await expect(
      getClusterResourceUsageSeries("cluster-1", {
        resourceType: "node",
        name: "worker-1",
      }),
    ).rejects.toMatchObject({
      kind: "invalid-payload",
      status: 200,
    } satisfies Partial<ApiError>);
  });

  it("preserves a cluster permission denial instead of returning no-data", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse({ detail: "cluster access denied" }, 403),
    );

    await expect(
      getClusterResourceUsageSeries("cluster-1", {
        resourceType: "node",
        name: "worker-1",
      }),
    ).rejects.toMatchObject({
      detail: "cluster access denied",
      kind: "forbidden",
      status: 403,
    } satisfies Partial<ApiError>);
  });
});

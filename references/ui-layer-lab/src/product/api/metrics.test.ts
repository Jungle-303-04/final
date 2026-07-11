import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "./client";
import { getClusterUsage } from "./metrics";

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("metrics API", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("normalizes known usage fields and drops open summary extras", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse({
        cluster_id: "cluster-1",
        samples: [
          {
            sampled_at: "2026-07-11T00:00:00Z",
            usage: {
              pod_total: 9,
              pod_running: 8,
              restart_total: 3,
              cpu_pct: 42.5,
              pods: { "sandbox/api-1": { cpu_mcores: 120 } },
              future_backend_field: "must-not-reach-product-state",
            },
          },
        ],
      }),
    );

    const response = await getClusterUsage("cluster/one", { limit: 31 });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/clusters/cluster%2Fone/usage?limit=31",
      expect.objectContaining({ credentials: "include", method: "GET" }),
    );
    expect(response.samples[0]?.usage).toEqual({
      pod_total: 9,
      pod_running: 8,
      restart_total: 3,
      cpu_pct: 42.5,
    });
  });

  it("loads the cluster usage card rollup with CPU and memory telemetry", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse({
        cluster_id: "cluster-1",
        samples: [
          {
            sampled_at: "2026-07-12T00:00:00Z",
            usage: {
              pod_total: 45,
              pod_running: 42,
              node_total: 3,
              node_ready: 3,
              cpu_pct: 41.5,
              mem_pct: 68.2,
            },
          },
        ],
      }),
    );

    const response = await getClusterUsage("cluster-1");

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/clusters/cluster-1/usage?limit=288",
      expect.objectContaining({ method: "GET", credentials: "include" }),
    );
    expect(response.samples[0]?.usage).toEqual({
      pod_total: 45,
      pod_running: 42,
      node_total: 3,
      node_ready: 3,
      cpu_pct: 41.5,
      mem_pct: 68.2,
    });
  });

  it("keeps CPU and memory unknown when the agent has no telemetry", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse({
        cluster_id: "cluster-1",
        samples: [
          {
            sampled_at: "2026-07-12T00:00:00Z",
            usage: { pod_total: 4, cpu_pct: null, mem_pct: null },
          },
        ],
      }),
    );

    const response = await getClusterUsage("cluster-1");

    expect(response.samples[0]?.usage.cpu_pct).toBeNull();
    expect(response.samples[0]?.usage.mem_pct).toBeNull();
  });

  it("rejects an invalid value in a known usage field", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse({
        cluster_id: "cluster-1",
        samples: [{ sampled_at: null, usage: { pod_total: "nine" } }],
      }),
    );

    await expect(getClusterUsage("cluster-1")).rejects.toMatchObject({
      kind: "invalid-payload",
    } satisfies Partial<ApiError>);
  });
});

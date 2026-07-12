import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "./client";
import {
  getClusterUsage,
  pollCommand,
  submitPrometheusQuery,
} from "./metrics";

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

  afterEach(() => {
    vi.useRealTimers();
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

  it("submits one Prometheus command and returns its receipt", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse({
        accepted: true,
        command_id: "cmd-metrics-1",
        correlation_id: "corr-metrics-1",
      }),
    );
    const query = {
      source: "prometheus" as const,
      name: "pod_cpu_usage",
      description: "Pod CPU usage",
      query: "sum(rate(container_cpu_usage_seconds_total[5m])) by (pod)",
      range_seconds: 3600,
      step_seconds: 60,
    };

    await expect(submitPrometheusQuery("cluster-1", query)).resolves.toMatchObject({
      receipt: {
        accepted: true,
        command_id: "cmd-metrics-1",
        correlation_id: "corr-metrics-1",
      },
    });
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/agent/debug/query",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ cluster_id: "cluster-1", query }),
      }),
    );
  });

  it("polls command status with GET until the command completes", async () => {
    vi.useFakeTimers();
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        jsonResponse({
          command_id: "cmd-metrics-1",
          cluster_id: "cluster-1",
          correlation_id: "corr-metrics-1",
          action: "telemetry.query.run",
          status: "running",
          result: {},
          completed_at: null,
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          command_id: "cmd-metrics-1",
          cluster_id: "cluster-1",
          correlation_id: "corr-metrics-1",
          action: "telemetry.query.run",
          status: "completed",
          result: {},
          completed_at: "2026-07-12T10:30:00Z",
        }),
      );

    const pending = pollCommand("cmd-metrics-1");
    await vi.runAllTimersAsync();
    await expect(pending).resolves.toMatchObject({
      command_id: "cmd-metrics-1",
      status: "completed",
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls.every(([, init]) => init?.method === "GET")).toBe(true);
  });

  it("stops polling when the caller aborts", async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse({
        command_id: "cmd-metrics-1",
        cluster_id: "cluster-1",
        correlation_id: "corr-metrics-1",
        action: "telemetry.query.run",
        status: "running",
        result: {},
        completed_at: null,
      }),
    );

    const pending = pollCommand("cmd-metrics-1", { signal: controller.signal });
    const rejection = expect(pending).rejects.toMatchObject({ name: "AbortError" });
    await Promise.resolve();
    controller.abort();
    await vi.runAllTimersAsync();

    await rejection;
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls.every(([, init]) => init?.method === "GET")).toBe(true);
  });
});

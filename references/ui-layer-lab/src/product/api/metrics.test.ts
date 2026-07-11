import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "./client";
import {
  MetricQueryExecutionError,
  getClusterUsage,
  getCommandStatus,
  pollCommand,
  runPrometheusQuery,
  submitPrometheusQuery,
} from "./metrics";
import { buildPrometheusQuery, getMetricPreset } from "../features/metrics/presets";

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function commandPayload(
  status: "queued" | "leased" | "running" | "completed" | "failed",
  result: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    command_id: "cmd-debug-1",
    cluster_id: "cluster-1",
    correlation_id: "corr-debug-1",
    action: "telemetry.query.run",
    status,
    result,
    completed_at: status === "completed" || status === "failed" ? "2026-07-11T00:00:00Z" : null,
  };
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

  it("submits one command with the execution id suffixed query name", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse({
        accepted: true,
        command_id: "cmd-debug-1",
        correlation_id: "corr-debug-1",
      }),
    );
    const preset = getMetricPreset("namespace-pod-count");
    const query = buildPrometheusQuery(preset, "run-20260711-001");

    const submitted = await submitPrometheusQuery(
      "cluster-1",
      query,
    );

    expect(submitted.query.name).toBe(
      "namespace_pod_count__run-20260711-001",
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/agent/debug/query",
      expect.objectContaining({
        body: JSON.stringify({
          cluster_id: "cluster-1",
          query: submitted.query,
        }),
        method: "POST",
      }),
    );
  });

  it("loads and validates a command status without re-enqueueing it", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(jsonResponse(commandPayload("running")));

    const command = await getCommandStatus("cmd/debug 1");

    expect(command.status).toBe("running");
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/commands/cmd%2Fdebug%201",
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("polls every three seconds until completed", async () => {
    vi.useFakeTimers();
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(jsonResponse(commandPayload("queued")))
      .mockResolvedValueOnce(jsonResponse(commandPayload("leased")))
      .mockResolvedValueOnce(jsonResponse(commandPayload("running")))
      .mockResolvedValueOnce(jsonResponse(commandPayload("completed", { ok: true })));

    const pending = pollCommand("cmd-debug-1");
    await vi.advanceTimersByTimeAsync(9_000);

    await expect(pending).resolves.toMatchObject({ status: "completed" });
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(fetchMock.mock.calls.every(([path]) => path === "/api/commands/cmd-debug-1")).toBe(true);
  });

  it("times out after sixty seconds without submitting another POST", async () => {
    vi.useFakeTimers();
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async () => jsonResponse(commandPayload("running")));

    const pending = pollCommand("cmd-debug-1");
    const rejection = expect(pending).rejects.toMatchObject({ kind: "timeout" });
    await vi.advanceTimersByTimeAsync(60_000);

    await rejection;
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === "POST")).toBe(false);
  });

  it("does not treat a completed command with empty series as success", async () => {
    const preset = getMetricPreset("node-cpu-usage");
    const queryName = "node_cpu_usage_ratio__run-empty";
    const query = buildPrometheusQuery(preset, "run-empty");
    const telemetryResult = {
      status: "completed",
      cluster_id: "cluster-1",
      applied: false,
      message: "telemetry query executed",
      retryable: false,
      resources: [],
      stdout: "",
      stderr: "",
      query: {
        source: "prometheus",
        name: queryName,
        description: preset.description,
        query: preset.promql,
        range_seconds: preset.rangeSeconds,
        step_seconds: preset.stepSeconds,
      },
      result: {
        source: "prometheus",
        results: {
          [queryName]: {
            query: preset.promql,
            query_mode: "range",
            range_seconds: preset.rangeSeconds,
            step_seconds: preset.stepSeconds,
            result_type: "matrix",
            series: [],
            point_count: 0,
          },
        },
      },
    };
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        jsonResponse({
          accepted: true,
          command_id: "cmd-debug-1",
          correlation_id: "corr-debug-1",
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse(commandPayload("completed", telemetryResult)),
      );

    await expect(
      runPrometheusQuery("cluster-1", query),
    ).rejects.toMatchObject({
      kind: "empty-result",
    } satisfies Partial<MetricQueryExecutionError>);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(1);
  });
});

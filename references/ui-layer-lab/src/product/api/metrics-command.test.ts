import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  MetricQueryExecutionError,
  getCommandStatus,
  pollCommand,
  runPrometheusQuery,
  submitPrometheusQuery,
} from "./metrics";
import {
  buildPrometheusQuery,
  getMetricPreset,
  type MetricPreset,
} from "../features/metrics/presets";

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

function telemetryResult(
  preset: MetricPreset,
  queryName: string,
  values: Array<{ timestamp: number; value: number }>,
): Record<string, unknown> {
  return {
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
          series: values.length === 0 ? [] : [{ metric: { instance: "node-1" }, values }],
          point_count: values.length,
        },
      },
    },
  };
}

describe("metrics command API", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
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
        jsonResponse(commandPayload("completed", telemetryResult(preset, queryName, []))),
      );

    await expect(
      runPrometheusQuery("cluster-1", query),
    ).rejects.toMatchObject({
      kind: "empty-result",
    } satisfies Partial<MetricQueryExecutionError>);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(1);
  });

  it("returns normalized points without leaking the raw command result", async () => {
    const preset = getMetricPreset("node-cpu-usage");
    const queryName = "node_cpu_usage_ratio__run-observed";
    const query = buildPrometheusQuery(preset, "run-observed");
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(jsonResponse({
        accepted: true,
        command_id: "cmd-debug-1",
        correlation_id: "corr-debug-1",
      }))
      .mockResolvedValueOnce(jsonResponse(commandPayload(
        "completed",
        telemetryResult(preset, queryName, [{ timestamp: 1, value: 0.42 }]),
      )));

    const run = await runPrometheusQuery("cluster-1", query);

    expect(run.result.point_count).toBe(1);
    expect(run.command).not.toHaveProperty("result");
  });
});

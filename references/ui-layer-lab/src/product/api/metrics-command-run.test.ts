import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  MetricQueryExecutionError,
  runPrometheusQuery,
} from "./index";
import {
  NODE_CPU_QUERY,
  commandPayload,
  jsonResponse,
  telemetryResult,
} from "./metrics-command.testSupport";

describe("metrics command API run normalization", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("does not treat a completed command with empty series as success", async () => {
    const query = {...NODE_CPU_QUERY, name: "node_cpu_usage_ratio__run-empty"};
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
        jsonResponse(commandPayload("completed", telemetryResult(query, []))),
      );

    await expect(
      runPrometheusQuery("cluster-1", query),
    ).rejects.toMatchObject({
      kind: "empty-result",
    } satisfies Partial<MetricQueryExecutionError>);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(1);
  });

  it("turns a failed terminal command into an explicit query error", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(jsonResponse({
        accepted: true,
        command_id: "cmd-debug-1",
        correlation_id: "corr-debug-1",
      }))
      .mockResolvedValueOnce(jsonResponse(commandPayload("failed", {
        message: "Prometheus rejected the query.",
      })));

    await expect(
      runPrometheusQuery("cluster-1", NODE_CPU_QUERY),
    ).rejects.toMatchObject({
      kind: "failed",
      message: "Prometheus rejected the query.",
      command: {
        command_id: "cmd-debug-1",
        cluster_id: "cluster-1",
        correlation_id: "corr-debug-1",
        action: "telemetry.query.run",
        status: "failed",
        completed_at: "2026-07-11T00:00:00Z",
      },
    } satisfies Partial<MetricQueryExecutionError>);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(1);
  });

  it("returns normalized points without leaking the raw command result", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(jsonResponse({
        accepted: true,
        command_id: "cmd-debug-1",
        correlation_id: "corr-debug-1",
      }))
      .mockResolvedValueOnce(jsonResponse(commandPayload(
        "completed",
        telemetryResult(NODE_CPU_QUERY, [{ timestamp: 1, value: 0.42 }]),
      )));

    const run = await runPrometheusQuery("cluster-1", NODE_CPU_QUERY);

    expect(run.result.point_count).toBe(1);
    expect(run.command).not.toHaveProperty("result");
  });
});

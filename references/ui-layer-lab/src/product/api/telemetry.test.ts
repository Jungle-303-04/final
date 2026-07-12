import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "./client";
import {
  runTelemetryQuery,
  TelemetryQueryExecutionError,
} from "./telemetry";
import type { TelemetryQueryDefinition } from "./telemetry-schemas";

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const QUERY = {
  source: "loki" as const,
  name: "pod_logs",
  description: "Selected Pod logs",
  query: '{namespace="default", pod="api-123"}',
  range_seconds: 900,
  step_seconds: null,
};

const LOG_RESULT = {
  source: "loki" as const,
  query_name: "pod_logs",
  query: QUERY.query,
  result_type: "streams",
  streams: [
    {
      stream: { namespace: "default", pod: "api-123" },
      values: [
        {
          timestamp: "1720786800000000000",
          line: "database connection timeout",
        },
      ],
    },
  ],
  line_count: 1,
  pattern_counts: { dependency_timeout: 1 },
  severity_counts: { error: 1 },
  trace_ids: [],
  redaction_summary: {
    applied: true,
    redacted_line_count: 0,
    truncated_line_count: 0,
  },
  range_seconds: 900,
};

function commandStatus(status: "running" | "completed" | "failed", result: unknown = {}) {
  return jsonResponse({
    command_id: "cmd-log-1",
    cluster_id: "cluster-1",
    correlation_id: "corr-log-1",
    action: "telemetry.query.run",
    status,
    result,
    completed_at: status === "completed" ? "2026-07-13T00:00:00Z" : null,
  });
}

function completedResult() {
  return {
    status: "completed",
    cluster_id: "cluster-1",
    applied: false,
    message: "telemetry query executed",
    retryable: false,
    resources: [],
    stdout: "",
    stderr: "",
    query: { ...QUERY },
    result: [LOG_RESULT],
  };
}

describe("telemetry log query API", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("submits one Loki query and returns the completed log snapshot", async () => {
    vi.useFakeTimers();
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        jsonResponse({
          accepted: true,
          command_id: "cmd-log-1",
          correlation_id: "corr-log-1",
        }),
      )
      .mockResolvedValueOnce(commandStatus("running"))
      .mockResolvedValueOnce(commandStatus("completed", completedResult()));

    const pending = runTelemetryQuery("cluster-1", QUERY);
    await vi.advanceTimersByTimeAsync(3_000);
    const result = await pending;

    expect(result.result[0].line_count).toBe(1);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(1);
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "/api/agent/debug/query",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ cluster_id: "cluster-1", query: QUERY }),
      }),
    );
  });

  it("rejects a completed command with an invalid log payload", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        jsonResponse({
          accepted: true,
          command_id: "cmd-log-1",
          correlation_id: "corr-log-1",
        }),
      )
      .mockResolvedValueOnce(commandStatus("completed", { ...completedResult(), result: [{ line_count: "1" }] }));

    await expect(runTelemetryQuery("cluster-1", QUERY)).rejects.toMatchObject({
      kind: "invalid-payload",
    });
    expect(fetchMock.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(1);
  });

  it("rejects a non-Loki source before opening the transport", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    const invalidQuery = {
      ...QUERY,
      source: "prometheus",
    } as unknown as TelemetryQueryDefinition;

    await expect(runTelemetryQuery("cluster-1", invalidQuery)).rejects.toMatchObject({
      name: "ZodError",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("turns a failed terminal command into an explicit telemetry error", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(jsonResponse({
        accepted: true,
        command_id: "cmd-log-1",
        correlation_id: "corr-log-1",
      }))
      .mockResolvedValueOnce(commandStatus("failed", {
        message: "Loki query rejected",
      }));

    await expect(runTelemetryQuery("cluster-1", QUERY)).rejects.toMatchObject({
      kind: "failed",
      message: "Loki query rejected",
    } satisfies Partial<TelemetryQueryExecutionError>);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(1);
  });

  it("rejects a completed command for a different query identity", async () => {
    const result = completedResult();
    result.query.name = "different_query";
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(jsonResponse({
        accepted: true,
        command_id: "cmd-log-1",
        correlation_id: "corr-log-1",
      }))
      .mockResolvedValueOnce(commandStatus("completed", result));

    await expect(runTelemetryQuery("cluster-1", QUERY)).rejects.toMatchObject({
      kind: "invalid-payload",
    } satisfies Partial<ApiError>);
  });

  it("preserves an empty observed log result as valid no-data", async () => {
    const result = completedResult();
    result.result = [];
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(jsonResponse({
        accepted: true,
        command_id: "cmd-log-1",
        correlation_id: "corr-log-1",
      }))
      .mockResolvedValueOnce(commandStatus("completed", result));

    await expect(runTelemetryQuery("cluster-1", QUERY)).resolves.toMatchObject({
      result: [],
    });
  });

  it("rejects unknown completed-result fields as contract drift", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(jsonResponse({
        accepted: true,
        command_id: "cmd-log-1",
        correlation_id: "corr-log-1",
      }))
      .mockResolvedValueOnce(commandStatus("completed", {
        ...completedResult(),
        unexpected: true,
      }));

    await expect(runTelemetryQuery("cluster-1", QUERY)).rejects.toMatchObject({
      kind: "invalid-payload",
    } satisfies Partial<ApiError>);
  });
});

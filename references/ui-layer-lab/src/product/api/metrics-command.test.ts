import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  ApiError,
  getCommandStatus,
  pollCommand,
  runPrometheusQuery,
  submitPrometheusQuery,
} from "./index";
import {
  NAMESPACE_POD_QUERY,
  commandPayload,
  jsonResponse,
} from "./metrics-command.testSupport";

describe("metrics command API", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("exports the command functions through the public API barrel", () => {
    expect([
      submitPrometheusQuery,
      getCommandStatus,
      pollCommand,
      runPrometheusQuery,
    ].every((value) => typeof value === "function")).toBe(true);
  });

  it("submits one API-owned query fixture with its stable name", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse({
        accepted: true,
        command_id: "cmd-debug-1",
        correlation_id: "corr-debug-1",
      }),
    );
    const submitted = await submitPrometheusQuery(
      "cluster-1",
      NAMESPACE_POD_QUERY,
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

  it("does not retry a possibly-sent query POST after a network failure", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValue(new TypeError("Failed to fetch"));

    await expect(
      submitPrometheusQuery("cluster-1", NAMESPACE_POD_QUERY),
    ).rejects.toMatchObject({kind: "network"} satisfies Partial<ApiError>);

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/agent/debug/query",
      expect.objectContaining({method: "POST"}),
    );
  });

  it("rejects an unknown receipt field as contract drift", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse({
        accepted: true,
        command_id: "cmd-debug-1",
        correlation_id: "corr-debug-1",
        unexpected: true,
      }),
    );

    await expect(
      submitPrometheusQuery("cluster-1", NAMESPACE_POD_QUERY),
    ).rejects.toMatchObject({kind: "invalid-payload"} satisfies Partial<ApiError>);
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

  it("rejects a command status with a missing required key", async () => {
    const {completed_at: _completedAt, ...missingCompletedAt} = commandPayload("running");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse(missingCompletedAt),
    );

    await expect(getCommandStatus("cmd-debug-1")).rejects.toMatchObject({
      kind: "invalid-payload",
    } satisfies Partial<ApiError>);
  });

  it.each([
    {status: 401, kind: "unauthorized", code: "session_required"},
    {status: 403, kind: "forbidden", code: "cluster_forbidden"},
    {status: 404, kind: "not-found", code: "command_not_found"},
  ] as const)(
    "preserves a $status command lookup error",
    async ({status, kind, code}) => {
      const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
        jsonResponse({
          detail: {code, detail: `command status ${status}`},
        }, status),
      );

      await expect(getCommandStatus("cmd-debug-1")).rejects.toMatchObject({
        code,
        detail: `command status ${status}`,
        kind,
        status,
      } satisfies Partial<ApiError>);
      expect(fetchMock).toHaveBeenCalledOnce();
    },
  );

  it.each([
    {status: 422, kind: "invalid-request", code: "invalid_query"},
    {status: 429, kind: "rate-limited", code: "query_rate_limited"},
  ] as const)(
    "preserves a $status query submission error without retrying",
    async ({status, kind, code}) => {
      const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
        jsonResponse({
          detail: {
            code,
            detail: `query submission ${status}`,
            retry_after: status === 429 ? 17 : undefined,
          },
        }, status),
      );

      await expect(
        submitPrometheusQuery("cluster-1", NAMESPACE_POD_QUERY),
      ).rejects.toMatchObject({
        code,
        detail: `query submission ${status}`,
        kind,
        retryAfter: status === 429 ? 17 : null,
        status,
      } satisfies Partial<ApiError>);
      expect(fetchMock).toHaveBeenCalledOnce();
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/agent/debug/query",
        expect.objectContaining({method: "POST"}),
      );
    },
  );

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

  it("returns a failed terminal command without another GET", async () => {
    vi.useFakeTimers();
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(jsonResponse(commandPayload("failed", {message: "query failed"})));

    await expect(pollCommand("cmd-debug-1")).resolves.toMatchObject({
      status: "failed",
    });
    await vi.advanceTimersByTimeAsync(60_000);

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls.every(([, init]) => init?.method === "GET")).toBe(true);
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
});

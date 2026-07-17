import { beforeEach, describe, expect, it, vi } from "vitest";

import { runScopedMetricQuery } from "./metrics";
import type { ScopedMetricCategory, ScopedMetricQueryRequest } from "./metrics-schemas";

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const request: ScopedMetricQueryRequest = {
  cluster_id: "cluster-1",
  subject: { kind: "resource" as const, resource_id: "pod:shop/api-0" },
  categories: ["cpu", "memory"],
  range: "1h" as const,
};

function acceptedResponse(overrides: Record<string, unknown> = {}) {
  return {
    availability: "queued",
    source: "prometheus",
    refresh_policy_key: "metrics_prometheus",
    scope: {
      workspace_id: "workspace-1",
      cluster_id: "cluster-1",
      namespaces: ["shop"],
      freshness: "live",
    },
    resource: {
      api_group: "",
      version: "v1",
      kind: "Pod",
      namespace: "shop",
      name: "api-0",
      uid: "pod-uid-1",
    },
    queries: [
      {
        category: "cpu",
        unit: "cores",
        query_name: "resource_cpu_a_1",
        command_id: "cmd-cpu",
        correlation_id: "corr-cpu",
      },
      {
        category: "memory",
        unit: "bytes",
        query_name: "resource_memory_a_1",
        command_id: "cmd-memory",
        correlation_id: "corr-memory",
      },
    ],
    coverage: { requested: 2, queued: 2, unsupported: 0 },
    reason_codes: [],
    ...overrides,
  };
}

function completedCommand(
  commandId: string,
  queryName: string,
  points: Array<{ timestamp: number; value: number | null }>,
) {
  return {
    command_id: commandId,
    cluster_id: "cluster-1",
    correlation_id: `corr-${commandId}`,
    action: "telemetry.query.run",
    status: "completed",
    result: {
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
        description: "Server-owned observation",
        query: "sum(metric)",
        range_seconds: 3600,
        step_seconds: 120,
      },
      result: {
        source: "prometheus",
        results: {
          [queryName]: {
            query: "sum(metric)",
            query_mode: "range",
            range_seconds: 3600,
            step_seconds: 120,
            result_type: "matrix",
            series: [{ metric: {}, values: points }],
            point_count: points.length,
          },
        },
      },
    },
    completed_at: "2026-07-17T00:00:00Z",
  };
}

describe("scoped resource metrics API", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("submits one typed batch without exposing PromQL and returns exact observations", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
      if (init?.method === "POST") return jsonResponse(acceptedResponse());
      const path = String(url);
      if (path.endsWith("cmd-cpu")) {
        return jsonResponse(completedCommand("cmd-cpu", "resource_cpu_a_1", [
          { timestamp: 10, value: 0.25 },
        ]));
      }
      return jsonResponse(completedCommand("cmd-memory", "resource_memory_a_1", [
        { timestamp: 10, value: 1048576 },
      ]));
    });

    const result = await runScopedMetricQuery(request);

    expect(result.completeness).toBe("exact");
    expect(result.observations).toHaveLength(2);
    const post = fetchMock.mock.calls.find(([, init]) => init?.method === "POST");
    expect(post?.[0]).toBe("/api/metrics/query");
    expect(JSON.parse(String(post?.[1]?.body))).toEqual(request);
    expect(JSON.parse(String(post?.[1]?.body))).not.toHaveProperty("query");
    expect(fetchMock.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(1);
  });

  it("preserves successful observations when another command fails", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
      if (init?.method === "POST") return jsonResponse(acceptedResponse());
      if (String(url).endsWith("cmd-cpu")) {
        return jsonResponse(completedCommand("cmd-cpu", "resource_cpu_a_1", [
          { timestamp: 10, value: 0.5 },
        ]));
      }
      return jsonResponse({
        command_id: "cmd-memory",
        cluster_id: "cluster-1",
        correlation_id: "corr-memory",
        action: "telemetry.query.run",
        status: "failed",
        result: { message: "Prometheus unavailable" },
        completed_at: "2026-07-17T00:00:00Z",
      });
    });

    const result = await runScopedMetricQuery(request);

    expect(result.completeness).toBe("partial");
    expect(result.observations.map((item) => item.category)).toEqual(["cpu"]);
    expect(result.reasonCodes).toContain("memory:command_failed");
  });

  it("does not poll when the server declares the real source unavailable", async () => {
    const response = acceptedResponse({
      availability: "unavailable",
      queries: [],
      coverage: { requested: 2, queued: 0, unsupported: 2 },
      reason_codes: ["resource_uid_unavailable"],
    });
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse(response));

    const result = await runScopedMetricQuery(request);

    expect(result.completeness).toBe("unavailable");
    expect(result.observations).toEqual([]);
    expect(result.reasonCodes).toEqual(["resource_uid_unavailable"]);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("fails closed when a command result has a different server query identity", async () => {
    const oneQuery = acceptedResponse({
      queries: [acceptedResponse().queries[0]],
      coverage: { requested: 1, queued: 1, unsupported: 0 },
    });
    const oneRequest: ScopedMetricQueryRequest = { ...request, categories: ["cpu"] };
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(jsonResponse(oneQuery))
      .mockResolvedValueOnce(jsonResponse(completedCommand(
        "cmd-cpu",
        "different_query",
        [{ timestamp: 10, value: 1 }],
      )));

    const result = await runScopedMetricQuery(oneRequest);

    expect(result.completeness).toBe("unavailable");
    expect(result.observations).toEqual([]);
    expect(result.reasonCodes).toEqual(["cpu:invalid_result"]);
  });

  it("rejects a response for a different cluster before polling commands", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse(acceptedResponse({
      scope: {
        workspace_id: "workspace-1",
        cluster_id: "cluster-other",
        namespaces: ["shop"],
        freshness: "live",
      },
    })));

    await expect(runScopedMetricQuery(request)).rejects.toMatchObject({
      kind: "invalid-payload",
    });
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("bounds bulk command polling to three concurrent requests", async () => {
    const categories: ScopedMetricCategory[] = [
      "cpu", "memory", "network_rx", "network_tx", "filesystem", "restarts",
    ];
    const queries = Array.from({ length: categories.length }, (_, index) => ({
      category: categories[index],
      unit: "count",
      query_name: `resource_bulk_${index}`,
      command_id: `cmd-${index}`,
      correlation_id: `corr-${index}`,
    }));
    let activeGets = 0;
    let maxActiveGets = 0;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
      if (init?.method === "POST") {
        return jsonResponse(acceptedResponse({
          queries,
          coverage: { requested: 6, queued: 6, unsupported: 0 },
        }));
      }
      activeGets += 1;
      maxActiveGets = Math.max(maxActiveGets, activeGets);
      await Promise.resolve();
      const commandId = String(url).split("/").pop() ?? "";
      const index = Number(commandId.split("-").pop());
      activeGets -= 1;
      return jsonResponse(completedCommand(commandId, `resource_bulk_${index}`, [
        { timestamp: 10, value: index },
      ]));
    });

    const result = await runScopedMetricQuery({
      cluster_id: "cluster-1",
      subject: { kind: "cluster" },
      categories,
      range: "15m",
    });

    expect(result.observations).toHaveLength(6);
    expect(maxActiveGets).toBeLessThanOrEqual(3);
  });
});

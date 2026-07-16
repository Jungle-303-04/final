import { describe, expect, it, vi } from "vitest";

import { createEmptyUnifiedFilterState } from "../filters/filterContract";
import { createResourceMetricsHistoryAdapter } from "./createResourceMetricsHistoryAdapter";
import type { ResourceMetricsHistoryEndpointResponse } from "./resourceMetricsHistoryEndpointContract";

function endpointResponse(
  overrides: Partial<ResourceMetricsHistoryEndpointResponse> = {},
): ResourceMetricsHistoryEndpointResponse {
  return {
    refresh_policy_key: "metrics_kubernetes",
    series: [{
      resource_id: "inventory-pod-1",
      cluster_id: "cluster-a",
      resource_type: "pod",
      namespace: "shop",
      name: "checkout-0",
      points: [
        { observed_at: "2026-07-14T00:00:00Z", cpu_mcores: 10, mem_mib: null },
        { observed_at: "2026-07-14T00:01:00Z", cpu_mcores: null, mem_mib: 64 },
      ],
      has_sparkline_points: true,
      completeness: "partial",
      partial_reason_codes: ["sample_gap"],
    }],
    completeness: "partial",
    partial_reason_codes: ["sample_gap"],
    snapshot: {
      snapshot_revision: 42,
      authorization_revision: "auth-1",
      filter_fingerprint: "filter-1",
      observed_at: "2026-07-14T00:01:00Z",
      stale: false,
      partial_reason_codes: [],
    },
    ...overrides,
  };
}

describe("Resource metrics history adapter", () => {
  it("loads one batch, preserves null samples, and forwards the signal", async () => {
    const getResourceMetricsHistory = vi.fn().mockResolvedValue(endpointResponse());
    const controller = new AbortController();
    const port = createResourceMetricsHistoryAdapter({ getResourceMetricsHistory });

    const result = await port.loadResourceMetricsHistory(
      createEmptyUnifiedFilterState(),
      ["inventory-pod-1"],
      { snapshotRevision: 42, range: "1h", limit: 60 },
      controller.signal,
    );

    expect(getResourceMetricsHistory).toHaveBeenCalledTimes(1);
    expect(getResourceMetricsHistory).toHaveBeenCalledWith(
      expect.objectContaining({ ids: ["inventory-pod-1"], snapshotRevision: 42 }),
      controller.signal,
    );
    expect(result.series[0]?.points).toEqual([
      { observedAt: "2026-07-14T00:00:00Z", cpuMillicores: 10, memoryMebibytes: null },
      { observedAt: "2026-07-14T00:01:00Z", cpuMillicores: null, memoryMebibytes: 64 },
    ]);
  });

  it.each([
    ["identity set", endpointResponse({ series: [] })],
    ["snapshot", endpointResponse({ snapshot: {
      ...endpointResponse().snapshot,
      snapshot_revision: 41,
    } })],
  ])("rejects a mismatched %s without a fallback", async (_label, response) => {
    const port = createResourceMetricsHistoryAdapter({
      getResourceMetricsHistory: vi.fn().mockResolvedValue(response),
    });
    await expect(port.loadResourceMetricsHistory(
      createEmptyUnifiedFilterState(),
      ["inventory-pod-1"],
      { snapshotRevision: 42 },
    )).rejects.toMatchObject({ code: "invalid-response" });
  });

  it("maps the server-owned Prometheus batch and exposes its refresh policy key", async () => {
    const runScopedMetricQuery = vi.fn().mockResolvedValue({
      endpoint: {
        availability: "queued",
        source: "prometheus",
        refresh_policy_key: "metrics_prometheus",
        scope: {
          workspace_id: "workspace-a",
          cluster_id: "cluster-1",
          namespaces: ["shop"],
          freshness: "live",
        },
        resource: {
          api_group: "",
          version: "v1",
          kind: "Pod",
          namespace: "shop",
          name: "checkout-api-0",
          uid: "pod-uid-1",
        },
        queries: [],
        coverage: { requested: 2, queued: 2, unsupported: 0 },
        reason_codes: [],
      },
      completeness: "exact",
      reasonCodes: [],
      observations: [
        {
          category: "cpu",
          unit: "cores",
          queryName: "cpu_query",
          command: {},
          result: {
            query: "sum(cpu)",
            query_mode: "range",
            range_seconds: 3600,
            step_seconds: 120,
            result_type: "matrix",
            series: [{ metric: {}, values: [{ timestamp: 10, value: 0.25 }] }],
            point_count: 1,
          },
        },
        {
          category: "memory",
          unit: "bytes",
          queryName: "memory_query",
          command: {},
          result: {
            query: "sum(memory)",
            query_mode: "range",
            range_seconds: 3600,
            step_seconds: 120,
            result_type: "matrix",
            series: [{ metric: {}, values: [{ timestamp: 10, value: 2 * 1024 * 1024 }] }],
            point_count: 1,
          },
        },
      ],
    });
    const port = createResourceMetricsHistoryAdapter({
      getResourceMetricsHistory: vi.fn(),
      runScopedMetricQuery,
    });

    const result = await port.loadScopedResourceMetrics!({
      id: "pod-1",
      identityStability: "uid",
      inventoryKey: "pod:shop/checkout-api-0",
      uid: "pod-uid-1",
      clusterId: "cluster-1",
      resourceType: "generic",
      apiVersion: "v1",
      kind: "Pod",
      namespace: "shop",
      name: "checkout-api-0",
      status: "Running",
      health: "healthy",
      healthStatus: "healthy",
      facts: { type: "generic" },
      observedAt: null,
      firstSeenAt: null,
      lastSeenAt: null,
      deletedAt: null,
    }, "1h");

    expect(result.series?.points[0]).toMatchObject({
      cpuMillicores: 250,
      memoryMebibytes: 2,
    });
    expect(result.refreshPolicyKey).toBe("metrics_prometheus");
  });

  it("maps exact PVC ratio evidence without deriving usage from capacity", async () => {
    const runScopedMetricQuery = vi.fn().mockResolvedValue({
      endpoint: {
        refresh_policy_key: "metrics_pvc",
        scope: { cluster_id: "cluster-1", freshness: "live" },
        resource: {
          kind: "PersistentVolumeClaim",
          namespace: "shop",
          name: "cache",
        },
      },
      completeness: "exact",
      reasonCodes: [],
      observations: [{
        category: "volume_usage",
        result: {
          series: [{ values: [{ timestamp: 10, value: 0.75 }] }],
        },
      }],
    });
    const port = createResourceMetricsHistoryAdapter({
      getResourceMetricsHistory: vi.fn(),
      runScopedMetricQuery,
    });

    const result = await port.loadScopedResourceMetrics!(pvcResource(), "15m");

    expect(runScopedMetricQuery).toHaveBeenCalledWith({
      cluster_id: "cluster-1",
      subject: { kind: "pvc", resource_id: "pvc:shop/cache" },
      categories: ["volume_usage"],
      range: "15m",
    }, { signal: undefined });
    expect(result.series).toMatchObject({
      resourceId: "pvc:shop/cache",
      resourceType: "pvc",
      source: "prometheus",
      freshness: "live",
      points: [{ volumeUsagePercent: 75 }],
    });
  });

  it("preserves unavailable PVC provenance, freshness, and coverage reasons", async () => {
    const port = createResourceMetricsHistoryAdapter({
      getResourceMetricsHistory: vi.fn(),
      runScopedMetricQuery: vi.fn().mockResolvedValue({
        endpoint: {
          refresh_policy_key: "metrics_pvc",
          scope: { cluster_id: "cluster-1", freshness: "disconnected" },
          resource: {
            kind: "PersistentVolumeClaim",
            namespace: "shop",
            name: "cache",
          },
        },
        completeness: "unavailable",
        reasonCodes: ["prometheus_unavailable"],
        observations: [],
      }),
    });

    const result = await port.loadScopedResourceMetrics!(pvcResource(), "15m");

    expect(result).toMatchObject({
      series: null,
      completeness: "unavailable",
      partialReasonCodes: ["prometheus_unavailable"],
      source: "prometheus",
      freshness: "disconnected",
    });
  });
});

function pvcResource() {
  return {
    id: "pvc-1",
    identityStability: "uid" as const,
    inventoryKey: "pvc:shop/cache",
    uid: "pvc-uid-1",
    clusterId: "cluster-1",
    resourceType: "pvc",
    apiVersion: "v1",
    kind: "PersistentVolumeClaim",
    namespace: "shop",
    name: "cache",
    status: "Bound",
    health: "healthy" as const,
    healthStatus: "healthy",
    facts: { type: "generic" as const },
    observedAt: "2026-07-17T00:01:00.000Z",
    firstSeenAt: null,
    lastSeenAt: "2026-07-17T00:01:00.000Z",
    deletedAt: null,
  };
}

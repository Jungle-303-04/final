// @vitest-environment jsdom

import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createEmptyUnifiedFilterState } from "../../features/filters/filterContract";
import type { ResourceMetricsHistoryBatch } from "../../features/resources/resourceMetricsHistoryContract";
import type { BrowserRefreshPolicyRegistry } from "../../shared/data/browserRefreshPolicyRegistry";
import { useResourceMetricsHistoryDataFrame } from "./useResourceMetricsHistoryDataFrame";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("resource metrics history refresh policy", () => {
  it("selects the server policy named by the measured source and keeps its cadence", async () => {
    vi.useFakeTimers();
    const loadResourceMetricsHistory = vi.fn().mockResolvedValue(
      metricBatch("metrics_prometheus", "exact"),
    );
    const refreshPolicies = policyRegistry({
      metrics_prometheus: policy(60),
    });
    const filterState = createEmptyUnifiedFilterState();
    const port = { loadResourceMetricsHistory };
    const reportUnauthorized = vi.fn();

    renderHook(() => useResourceMetricsHistoryDataFrame({
      active: true,
      authorityKey: "workspace:user",
      filterState,
      port,
      range: "1h",
      refreshPolicies,
      reportUnauthorized,
      resourceIds: ["pod-a"],
      snapshotRevision: 42,
    }));

    await flush();
    expect(refreshPolicies.getPolicy).toHaveBeenCalledWith(
      "metrics_prometheus",
      expect.any(AbortSignal),
    );
    act(() => vi.advanceTimersByTime(59_999));
    await flush();
    expect(loadResourceMetricsHistory).toHaveBeenCalledOnce();
    act(() => vi.advanceTimersByTime(1));
    await flush();
    expect(loadResourceMetricsHistory).toHaveBeenCalledTimes(2);
  });

  it("bounds unavailable-source retries with the server retry policy", async () => {
    vi.useFakeTimers();
    const loadResourceMetricsHistory = vi.fn()
      .mockResolvedValueOnce(metricBatch("metrics_kubernetes", "unavailable"))
      .mockResolvedValueOnce(metricBatch("metrics_kubernetes", "unavailable"))
      .mockResolvedValueOnce(metricBatch("metrics_kubernetes", "unavailable"))
      .mockResolvedValueOnce(metricBatch("metrics_kubernetes", "exact"));
    const refreshPolicies = policyRegistry({
      metrics_kubernetes: policy(30, 2, 2),
    });
    const filterState = createEmptyUnifiedFilterState();
    const port = { loadResourceMetricsHistory };
    const reportUnauthorized = vi.fn();
    const rendered = renderHook(() => useResourceMetricsHistoryDataFrame({
      active: true,
      authorityKey: "workspace:user",
      filterState,
      port,
      range: "1h",
      refreshPolicies,
      reportUnauthorized,
      resourceIds: ["pod-a"],
      snapshotRevision: 42,
    }));

    await flush();
    expect(rendered.result.current.unavailableRetry).toMatchObject({ attempt: 1, limit: 2 });
    act(() => vi.advanceTimersByTime(2_000));
    await flush();
    expect(rendered.result.current.unavailableRetry).toMatchObject({ attempt: 2, limit: 2 });
    act(() => vi.advanceTimersByTime(2_000));
    await flush();
    expect(loadResourceMetricsHistory).toHaveBeenCalledTimes(3);
    expect(rendered.result.current.unavailableRetry).toMatchObject({ exhausted: true, limit: 2 });

    act(() => vi.advanceTimersByTime(29_999));
    await flush();
    expect(loadResourceMetricsHistory).toHaveBeenCalledTimes(3);
    act(() => vi.advanceTimersByTime(1));
    await flush();
    expect(loadResourceMetricsHistory).toHaveBeenCalledTimes(4);
    expect(rendered.result.current.unavailableRetry).toBeNull();
  });
});

function metricBatch(
  refreshPolicyKey: ResourceMetricsHistoryBatch["refreshPolicyKey"],
  completeness: ResourceMetricsHistoryBatch["completeness"],
): ResourceMetricsHistoryBatch {
  const exact = completeness === "exact";
  return {
    refreshPolicyKey,
    completeness,
    partialReasonCodes: exact ? [] : ["metrics_history_unavailable"],
    series: [{
      clusterId: "cluster-a",
      completeness,
      hasSparklinePoints: exact,
      name: "pod-a",
      namespace: "shop",
      partialReasonCodes: exact ? [] : ["metrics_history_unavailable"],
      points: exact ? [{
        cpuMillicores: 12,
        memoryMebibytes: 64,
        observedAt: "2026-07-17T00:00:00Z",
      }] : [],
      resourceId: "pod-a",
      resourceType: "pod",
    }],
    snapshot: {
      authorizationRevision: "auth-1",
      filterFingerprint: "filter-1",
      observedAt: "2026-07-17T00:00:00Z",
      partialReasonCodes: [],
      snapshotRevision: 42,
      stale: false,
    },
  };
}

function policy(
  refreshAfterSeconds: number,
  retryAfterSeconds: number | null = null,
  retryLimit: number | null = null,
) {
  return {
    eventInvalidation: false,
    keepLastSuccess: true as const,
    pauseWhenHidden: true as const,
    postMutationRefreshAfterSeconds: null,
    refreshAfterSeconds,
    retryAfterSeconds,
    retryLimit,
    staleAfterSeconds: null,
  };
}

function policyRegistry(
  policies: Partial<Record<ResourceMetricsHistoryBatch["refreshPolicyKey"], ReturnType<typeof policy>>>,
): BrowserRefreshPolicyRegistry<ResourceMetricsHistoryBatch["refreshPolicyKey"]> & {
  getPolicy: ReturnType<typeof vi.fn>;
} {
  return {
    getPolicy: vi.fn((key: ResourceMetricsHistoryBatch["refreshPolicyKey"]) => {
      const selected = policies[key];
      if (!selected) return Promise.reject(new Error(`missing policy ${key}`));
      return Promise.resolve(selected);
    }),
  };
}

async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

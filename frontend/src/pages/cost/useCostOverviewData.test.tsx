// @vitest-environment jsdom

import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { CostPort } from "../../features/cost/costContract";
import { useCostOverview } from "./useCostOverviewData";

afterEach(() => vi.useRealTimers());

describe("useCostOverview", () => {
  it("uses the server refresh policy rather than a browser-owned Cost interval", async () => {
    vi.useFakeTimers();
    const port = costPort({ summary: 1 });
    const rendered = renderHook(() => useCostOverview(port, {
      clusterIds: ["cluster-a"],
      namespaces: [],
      timeRange: "24h",
    }));

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(port.getOverview).toHaveBeenCalledOnce();
    expect(rendered.result.current.frame.phase).toBe("ready");
    await act(async () => vi.advanceTimersByTime(1_000));
    expect(port.getOverview).toHaveBeenCalledTimes(2);
    expect(rendered.result.current.frame).toMatchObject({
      phase: "ready",
      data: { summary: { hourlyCost: null } },
    });
    rendered.unmount();
  });

  it("renders validated Cost data without waiting for a delayed refresh policy", async () => {
    const pendingPolicy = deferred<Awaited<ReturnType<CostPort["loadRefreshPolicy"]>>>();
    const port = costPort();
    let policySignal: AbortSignal | undefined;
    port.loadRefreshPolicy.mockImplementation((_channel, signal) => {
      policySignal = signal;
      return pendingPolicy.promise;
    });
    const rendered = renderHook(() => useCostOverview(port, {
      clusterIds: ["cluster-a"],
      namespaces: [],
      timeRange: "24h",
    }));

    await waitFor(() => expect(rendered.result.current.frame.phase).toBe("ready"));
    expect(port.getOverview).toHaveBeenCalledOnce();
    expect(port.loadRefreshPolicy).toHaveBeenCalledOnce();

    rendered.unmount();
    await act(async () => {
      await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
    });
    expect(policySignal?.aborted).toBe(true);
  });

  it("keeps validated Cost data ready when the refresh policy fails", async () => {
    const port = costPort();
    port.loadRefreshPolicy.mockRejectedValueOnce(new Error("policy unavailable"));
    const rendered = renderHook(() => useCostOverview(port, {
      clusterIds: ["cluster-a"],
      namespaces: [],
      timeRange: "24h",
    }));

    await waitFor(() => expect(rendered.result.current.frame.phase).toBe("ready"));
    expect(rendered.result.current.frame).toMatchObject({
      phase: "ready",
      data: { summary: { hourlyCost: null } },
    });
    rendered.unmount();
  });

  it("retries an initial Cost data failure without coupling the policy request", async () => {
    const port = costPort();
    port.getOverview.mockRejectedValueOnce(new Error("overview unavailable"));
    const rendered = renderHook(() => useCostOverview(port, {
      clusterIds: ["cluster-a"],
      namespaces: [],
      timeRange: "24h",
    }));

    await waitFor(() => expect(rendered.result.current.frame.phase).toBe("failed"));
    act(() => rendered.result.current.refresh());
    await waitFor(() => expect(rendered.result.current.frame.phase).toBe("ready"));
    expect(port.getOverview).toHaveBeenCalledTimes(2);
    rendered.unmount();
  });

  it("selects the server node cadence without reusing the summary interval", async () => {
    vi.useFakeTimers();
    const port = costPort({ nodes: 3 });
    const rendered = renderHook(() => useCostOverview(port, {
      clusterIds: ["cluster-a"],
      namespaces: [],
      timeRange: "24h",
    }, "nodes"));

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(port.getOverview).toHaveBeenCalledTimes(1);

    act(() => vi.advanceTimersByTime(2_999));
    expect(port.getOverview).toHaveBeenCalledTimes(1);
    await act(async () => vi.advanceTimersByTime(1));
    expect(port.getOverview).toHaveBeenCalledTimes(2);
    expect(port.loadRefreshPolicy).toHaveBeenCalledWith("nodes", expect.any(AbortSignal));
    rendered.unmount();
  });

  it("retains the last successful Cost frame and does not create a retry loop after failure", async () => {
    vi.useFakeTimers();
    const port = costPort({ summary: 1 });
    const rendered = renderHook(() => useCostOverview(port, {
      clusterIds: ["cluster-a"],
      namespaces: [],
      timeRange: "24h",
    }));
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    port.getOverview.mockRejectedValueOnce(new Error("background unavailable"));
    await act(async () => vi.advanceTimersByTime(1_000));
    expect(rendered.result.current.frame).toMatchObject({
      phase: "ready",
      refreshFailure: { code: "error" },
    });
    await act(async () => vi.advanceTimersByTime(60_000));
    expect(port.getOverview).toHaveBeenCalledTimes(2);
    rendered.unmount();
  });
});

function costPort(intervals: Partial<Record<"summary" | "trend" | "nodes", number>> = {}) {
  return {
    getOverview: vi.fn().mockResolvedValue(overview()),
    getNodes: vi.fn().mockResolvedValue(nodePage()),
    loadRefreshPolicy: vi.fn<CostPort["loadRefreshPolicy"]>(async (channel) => ({
      staleAfterSeconds: 30,
      refreshAfterSeconds: intervals[channel] ?? 1,
      keepLastSuccess: true as const,
      pauseWhenHidden: true as const,
      eventInvalidation: false,
      retryAfterSeconds: null,
      retryLimit: null,
      postMutationRefreshAfterSeconds: null,
    })),
  } satisfies CostPort & {
    getOverview: ReturnType<typeof vi.fn>;
    loadRefreshPolicy: ReturnType<typeof vi.fn>;
  };
}

function nodePage() {
  return {
    scopeCoverage: overview().scopeCoverage,
    items: [],
    total: 0,
    countCompleteness: "exact" as const,
    hasMore: false,
    nextCursor: null,
    snapshotRevision: 1,
    pricingCoverage: {
      availability: "unavailable" as const,
      reasonCodes: ["node_pricing_observation_not_integrated"],
    },
  };
}

function overview() {
  return {
    scopeCoverage: {
      availability: "available" as const,
      scopes: [{ workspaceId: "workspace-a", clusterId: "cluster-a", namespaces: [], freshness: "live" as const }],
      observedAt: "2026-07-16T09:00:00Z",
      reasonCodes: [],
    },
    observation: {
      availability: "unavailable" as const,
      observedAt: null,
      currency: null,
      dataWindow: null,
      reasonCodes: ["cost_observation_unavailable"],
    },
    summary: {
      availability: "unavailable" as const,
      hourlyCost: null,
      monthlyProjection: null,
      storageCost: null,
      idleCost: null,
      efficiency: null,
      savingsRecommendations: null,
      reasonCodes: ["cost_observation_unavailable"],
    },
    trend: {
      availability: "unavailable" as const,
      timeRange: "24h" as const,
      currency: null,
      series: [] as const,
      reasonCodes: ["cost_observation_unavailable"],
    },
  };
}

function deferred<T>(): {
  promise: Promise<T>;
  resolve(value: T): void;
  reject(reason?: unknown): void;
} {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}

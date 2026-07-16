// @vitest-environment jsdom

import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { CostPort } from "../../features/cost/costContract";
import { useCostOverview } from "./useCostOverviewData";

afterEach(() => vi.useRealTimers());

describe("useCostOverview", () => {
  it("uses the server refresh policy rather than a browser-owned Cost interval", async () => {
    const port: CostPort = { getOverview: vi.fn().mockResolvedValue(overview()) };
    const rendered = renderHook(() => useCostOverview(port, {
      clusterIds: ["cluster-a"],
      timeRange: "24h",
    }));

    await waitFor(() => {
      expect(port.getOverview).toHaveBeenCalledOnce();
      expect(rendered.result.current.frame.phase).toBe("ready");
    });
    await waitFor(() => expect(port.getOverview).toHaveBeenCalledTimes(2), { timeout: 2_000 });
    expect(rendered.result.current.frame).toMatchObject({
      phase: "ready",
      data: { refreshAfterSeconds: 1, summary: { hourlyCost: null } },
    });
    rendered.unmount();
  });

  it("selects the server node cadence without reusing the summary interval", async () => {
    vi.useFakeTimers();
    const port: CostPort = { getOverview: vi.fn().mockResolvedValue(overview()) };
    const rendered = renderHook(() => useCostOverview(port, {
      clusterIds: ["cluster-a"],
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
    rendered.unmount();
  });
});

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
      reasonCodes: ["cost_observation_not_integrated"],
    },
    summary: {
      availability: "unavailable" as const,
      hourlyCost: null,
      monthlyProjection: null,
      storageCost: null,
      idleCost: null,
      efficiency: null,
      savingsRecommendations: null,
      reasonCodes: ["cost_observation_not_integrated"],
    },
    trend: {
      availability: "unavailable" as const,
      timeRange: "24h" as const,
      currency: null,
      series: [] as const,
      reasonCodes: ["cost_observation_not_integrated"],
    },
    refreshAfterSeconds: 1,
    trendRefreshAfterSeconds: 2,
    nodesRefreshAfterSeconds: 3,
  };
}

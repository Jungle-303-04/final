// @vitest-environment jsdom

import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { CostPort } from "../../features/cost/costContract";
import { useCostOverview } from "./useCostOverviewData";

describe("useCostOverview", () => {
  it("uses the server refresh policy rather than a browser-owned Cost interval", async () => {
    const port: CostPort = { getOverview: vi.fn().mockResolvedValue(overview()) };
    const rendered = renderHook(() => useCostOverview(port, { clusterIds: ["cluster-a"] }));

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
    refreshAfterSeconds: 1,
  };
}

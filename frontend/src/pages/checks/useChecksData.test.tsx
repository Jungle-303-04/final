// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { ChecksPort } from "../../features/checks/checksContract";
import { useChecksOverview } from "./useChecksData";

afterEach(() => vi.useRealTimers());

describe("useChecksOverview", () => {
  it("uses the injected audit refresh policy instead of a browser-owned interval", async () => {
    vi.useFakeTimers();
    const port = checksPort();
    const rendered = renderHook(() => useChecksOverview(port, {
      clusterIds: ["cluster-a"],
      namespaces: ["cluster-a/storefront"],
    }));

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(port.getOverview).toHaveBeenCalledTimes(1);
    expect(port.loadRefreshPolicy).toHaveBeenCalledTimes(1);
    await act(async () => vi.advanceTimersByTime(59_999));
    expect(port.getOverview).toHaveBeenCalledTimes(1);
    await act(async () => vi.advanceTimersByTime(1));
    expect(port.getOverview).toHaveBeenCalledTimes(2);
    rendered.unmount();
  });
});

function checksPort(): ChecksPort & {
  getOverview: ReturnType<typeof vi.fn>;
  loadRefreshPolicy: ReturnType<typeof vi.fn>;
} {
  return {
    loadRefreshPolicy: vi.fn().mockResolvedValue({
      staleAfterSeconds: 30,
      refreshAfterSeconds: 60,
      keepLastSuccess: true,
      pauseWhenHidden: true,
      eventInvalidation: false,
      retryAfterSeconds: null,
      retryLimit: null,
      postMutationRefreshAfterSeconds: null,
    }),
    getOverview: vi.fn().mockResolvedValue({
      scopeCoverage: {
        availability: "available",
        scopes: [{
          workspaceId: "workspace-a",
          clusterId: "cluster-a",
          namespaces: ["storefront"],
          freshness: "live",
        }],
        observedAt: "2026-07-17T05:59:30+00:00",
        reasonCodes: [],
      },
      resultSet: {
        availability: "available",
        evaluatedAt: "2026-07-17T05:59:30+00:00",
        checks: [],
        totalCheckCount: 0,
        totalFindingCount: 0,
        reasonCodes: [],
      },
      catalog: { availability: "available", entries: [], reasonCodes: [] },
      visibility: { availability: "available", clusters: [], reasonCodes: [] },
    }),
    getDetail: vi.fn(),
  };
}

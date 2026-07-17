// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { CostNodePage, CostPort } from "../../features/cost/costContract";
import { useCostNodes } from "./useCostNodesData";

afterEach(() => vi.useRealTimers());

describe("useCostNodes", () => {
  it("uses the server-owned node cadence and keeps the last successful page", async () => {
    vi.useFakeTimers();
    const port = costPort();
    const rendered = renderHook(() => useCostNodes(port, {
      clusterIds: ["cluster-a"],
      namespaces: ["cluster-a/shop"],
    }));

    await flush();
    expect(port.getNodes).toHaveBeenCalledWith({
      clusterIds: ["cluster-a"],
      namespaces: ["cluster-a/shop"],
      limit: 50,
    }, expect.any(AbortSignal));
    expect(port.loadRefreshPolicy).toHaveBeenCalledWith("nodes", expect.any(AbortSignal));

    act(() => vi.advanceTimersByTime(2_999));
    expect(port.getNodes).toHaveBeenCalledTimes(1);
    await act(async () => vi.advanceTimersByTime(1));
    expect(port.getNodes).toHaveBeenCalledTimes(2);

    port.getNodes.mockRejectedValueOnce(new Error("background unavailable"));
    await act(async () => vi.advanceTimersByTime(3_000));
    expect(rendered.result.current.frame).toMatchObject({
      phase: "ready",
      data: { items: [{ resource: { name: "node-a" } }] },
      refreshFailure: { code: "error" },
    });
    rendered.unmount();
  });

  it("loads a signed next page without replacing prior rows", async () => {
    const first = page({ hasMore: true, nextCursor: "signed-next" });
    const second = page({
      items: [{ ...first.items[0]!, resource: { ...first.items[0]!.resource, name: "node-b", uid: "uid-b" } }],
      snapshotRevision: first.snapshotRevision,
    });
    const port = costPort(first);
    port.getNodes.mockResolvedValueOnce(first).mockResolvedValueOnce(second);
    const rendered = renderHook(() => useCostNodes(port, {
      clusterIds: ["cluster-a"],
      namespaces: [],
    }));

    await flush();
    await act(async () => rendered.result.current.loadMore());

    expect(port.getNodes).toHaveBeenLastCalledWith({
      clusterIds: ["cluster-a"],
      namespaces: [],
      cursor: "signed-next",
      limit: 50,
    }, expect.any(AbortSignal));
    expect(rendered.result.current.frame).toMatchObject({
      phase: "ready",
      data: {
        items: [
          { resource: { name: "node-a" } },
          { resource: { name: "node-b" } },
        ],
        hasMore: false,
      },
    });
    rendered.unmount();
  });
});

async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

function costPort(initial = page()) {
  return {
    getOverview: vi.fn(),
    getNodes: vi.fn().mockResolvedValue(initial),
    loadRefreshPolicy: vi.fn().mockResolvedValue({
      staleAfterSeconds: 30,
      refreshAfterSeconds: 3,
      keepLastSuccess: true as const,
      pauseWhenHidden: true as const,
      eventInvalidation: false,
      retryAfterSeconds: null,
      retryLimit: null,
      postMutationRefreshAfterSeconds: null,
    }),
  } satisfies CostPort & {
    getNodes: ReturnType<typeof vi.fn>;
  };
}

function page(overrides: Partial<CostNodePage> = {}): CostNodePage {
  return {
    scopeCoverage: {
      availability: "available",
      scopes: [{ workspaceId: "workspace-a", clusterId: "cluster-a", namespaces: [], freshness: "live" }],
      observedAt: "2026-07-17T01:00:00Z",
      reasonCodes: [],
    },
    items: [{
      resource: { version: "v1", kind: "Node", name: "node-a", uid: "uid-a" },
      clusterId: "cluster-a",
      clusterName: "prod",
      provider: "eks",
      providerId: "aws:///zone/i-a",
      instanceType: "m6i.large",
      zone: "ap-northeast-2a",
      capacityType: "spot",
      status: "Ready",
      observedAt: "2026-07-17T01:00:00Z",
      capacity: { cpuMillicores: 1900, memoryMib: 7168, pods: 58 },
      usage: {
        availability: "available",
        observedAt: "2026-07-17T01:00:00Z",
        cpuMillicores: 950,
        memoryMib: 3584,
        cpuUtilizationPercent: 50,
        memoryUtilizationPercent: 50,
        reasonCodes: [],
      },
      pricing: {
        availability: "unavailable",
        currency: null,
        hourlyRateMicros: null,
        reasonCodes: ["node_pricing_observation_not_integrated"],
      },
    }],
    total: 1,
    countCompleteness: "exact",
    hasMore: false,
    nextCursor: null,
    snapshotRevision: 41,
    pricingCoverage: {
      availability: "unavailable",
      reasonCodes: ["node_pricing_observation_not_integrated"],
    },
    ...overrides,
  };
}

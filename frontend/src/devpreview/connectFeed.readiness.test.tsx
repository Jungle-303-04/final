// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useClusterActivationReadiness } from "./connectFeed";

const mocks = vi.hoisted(() => ({
  getClusterUsage: vi.fn(),
  getInventorySummary: vi.fn(),
}));

vi.mock("../api/inventory-summary", () => ({ getInventorySummary: mocks.getInventorySummary }));
vi.mock("../api/metrics", () => ({ getClusterUsage: mocks.getClusterUsage }));

function inventory(latestSnapshot: Record<string, unknown> | null) {
  return {
    cluster_id: "game-server",
    latest_snapshot: latestSnapshot,
    counts: [],
    namespaces: [],
    counts_evidence: {
      completeness: latestSnapshot ? "observed" : "unavailable",
      observed_at: latestSnapshot ? "2026-07-21T00:00:00Z" : null,
      namespace_scope: [],
      reason_codes: [],
      forbidden: [],
    },
  };
}

function usage(cpuPct: number | null) {
  return {
    cluster_id: "game-server",
    samples: [{
      sampled_at: "2026-07-21T00:00:00Z",
      usage: { cpu_pct: cpuPct, mem_pct: null },
    }],
  };
}

describe("cluster activation readiness", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    Object.defineProperty(document, "hidden", { configurable: true, value: false });
    mocks.getInventorySummary.mockReset();
    mocks.getClusterUsage.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("does not request inventory or metrics before a real heartbeat", () => {
    const rendered = renderHook(() => useClusterActivationReadiness("game-server", "waiting"));

    expect(rendered.result.current).toEqual({
      status: "waiting",
      heartbeat: "waiting",
      inventory: "waiting",
      metrics: "waiting",
    });
    expect(mocks.getInventorySummary).not.toHaveBeenCalled();
    expect(mocks.getClusterUsage).not.toHaveBeenCalled();
  });

  it("reports Ready only after real inventory and telemetry evidence are both observed", async () => {
    mocks.getInventorySummary
      .mockResolvedValueOnce(inventory(null))
      .mockResolvedValueOnce(inventory({ snapshot_id: "snapshot-1" }));
    mocks.getClusterUsage
      .mockResolvedValueOnce(usage(null))
      .mockResolvedValueOnce(usage(31.4));

    const rendered = renderHook(() => useClusterActivationReadiness("game-server", "connected"));
    await act(async () => { await Promise.resolve(); });
    expect(rendered.result.current).toMatchObject({
      status: "waiting",
      heartbeat: "ready",
      inventory: "waiting",
      metrics: "waiting",
    });

    await act(async () => { await vi.advanceTimersByTimeAsync(3_000); });
    expect(rendered.result.current).toEqual({
      status: "ready",
      heartbeat: "ready",
      inventory: "ready",
      metrics: "ready",
    });
    expect(mocks.getInventorySummary).toHaveBeenCalledTimes(2);
    expect(mocks.getClusterUsage).toHaveBeenCalledTimes(2);
  });

  it("keeps failed API evidence visible and never invents readiness", async () => {
    mocks.getInventorySummary.mockRejectedValue(new Error("inventory unavailable"));
    mocks.getClusterUsage.mockResolvedValue(usage(null));

    const rendered = renderHook(() => useClusterActivationReadiness("game-server", "connected"));
    await act(async () => { await Promise.resolve(); });

    expect(rendered.result.current).toEqual({
      status: "error",
      heartbeat: "ready",
      inventory: "error",
      metrics: "waiting",
    });
  });
});

// @vitest-environment jsdom

import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { ReleaseRun } from "../../features/gitops/gitOpsContract";
import type { BrowserRefreshPolicyRegistry } from "../../shared/data/browserRefreshPolicyRegistry";
import { gitOpsPort } from "./GitOpsPage.testSupport";
import { useWorkflowData } from "./useWorkflowData";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("workflow run observation", () => {
  it("polls active runs at the injected server cadence, publishes a transition once, and stops at terminal", async () => {
    vi.useFakeTimers();
    const port = gitOpsPort();
    port.listRuns = vi.fn()
      .mockResolvedValueOnce([releaseRun("running")])
      .mockResolvedValueOnce([releaseRun("succeeded")]);
    const onRunTransition = vi.fn();
    const refreshPolicies = policyRegistry();

    renderHook(() => useWorkflowData(port, "plan-a", refreshPolicies, onRunTransition));
    await flush();

    expect(refreshPolicies.getPolicy).toHaveBeenCalledWith("gitops_rows", expect.any(AbortSignal));
    expect(port.listRuns).toHaveBeenCalledOnce();
    expect(onRunTransition).not.toHaveBeenCalled();

    act(() => vi.advanceTimersByTime(1_000));
    await flush();

    expect(port.listRuns).toHaveBeenCalledTimes(2);
    expect(onRunTransition).toHaveBeenCalledOnce();
    expect(onRunTransition).toHaveBeenCalledWith(expect.objectContaining({
      previousStatus: "running",
      status: "succeeded",
    }));

    act(() => vi.advanceTimersByTime(10_000));
    await flush();
    expect(port.listRuns).toHaveBeenCalledTimes(2);
  });

  it("keeps the last confirmed run visible and exposes a retry after polling fails", async () => {
    vi.useFakeTimers();
    const port = gitOpsPort();
    port.listRuns = vi.fn()
      .mockResolvedValueOnce([releaseRun("running")])
      .mockRejectedValueOnce(new Error("run polling unavailable"))
      .mockResolvedValueOnce([releaseRun("succeeded")]);
    const refreshPolicies = policyRegistry();

    const { result } = renderHook(() => (
      useWorkflowData(port, "plan-a", refreshPolicies)
    ));
    await flush();

    act(() => vi.advanceTimersByTime(1_000));
    await flush();

    expect(result.current.runs).toHaveLength(1);
    expect(result.current.runs[0]?.status).toBe("running");
    expect(result.current.runsError).toEqual(new Error("run polling unavailable"));
    expect(result.current.error).toBeNull();

    act(() => result.current.refreshRuns());
    await flush();

    expect(result.current.runs[0]?.status).toBe("succeeded");
    expect(result.current.runsError).toBeNull();
  });
});

function policyRegistry(): BrowserRefreshPolicyRegistry<"gitops_rows"> & {
  getPolicy: ReturnType<typeof vi.fn>;
} {
  return {
    getPolicy: vi.fn().mockResolvedValue({
      eventInvalidation: false,
      keepLastSuccess: true,
      pauseWhenHidden: true,
      postMutationRefreshAfterSeconds: null,
      refreshAfterSeconds: 1,
      retryAfterSeconds: null,
      retryLimit: null,
      staleAfterSeconds: null,
    }),
  };
}

function releaseRun(status: string): ReleaseRun {
  return {
    run_id: "run-a",
    plan_id: "plan-a",
    plan_name: "Production release",
    status,
    derived_status: status,
    current_wave: 1,
    total_waves: 1,
    settings: {},
    github: {},
    rollback: {},
    health: {},
    steps: [],
    events: [],
    updated_at: "2026-07-20T01:00:00Z",
  };
}

async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

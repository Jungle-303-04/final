// @vitest-environment jsdom

import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { RightsizingPort, RightsizingScan } from "./rightsizingContract";
import { useRightsizingScans } from "./useRightsizingScans";

describe("useRightsizingScans", () => {
  it("waits for an explicit run and retains the last exact-scope scan after a partial refresh failure", async () => {
    const port: RightsizingPort = {
      getScan: vi.fn()
        .mockResolvedValueOnce(scan("cluster-a"))
        .mockRejectedValueOnce(new Error("offline")),
    };
    const rendered = renderHook(() => useRightsizingScans(port, [{
      clusterId: "cluster-a",
      namespaces: ["shop"],
    }]));

    expect(port.getScan).not.toHaveBeenCalled();
    await act(async () => rendered.result.current.run());
    await waitFor(() => expect(rendered.result.current.frame.phase).toBe("ready"));
    expect(rendered.result.current.frame.scans).toHaveLength(1);

    await act(async () => rendered.result.current.run());
    await waitFor(() => expect(rendered.result.current.frame.phase).toBe("ready"));
    expect(rendered.result.current.frame.scans).toHaveLength(1);
    expect(rendered.result.current.frame.failures).toHaveLength(1);
  });

  it("reuses the response-owned refresh cadence after the first explicit scan", async () => {
    vi.useFakeTimers();
    const port: RightsizingPort = {
      getScan: vi.fn().mockResolvedValue(scan("cluster-a")),
    };
    const rendered = renderHook(() => useRightsizingScans(port, [{
      clusterId: "cluster-a",
      namespaces: ["shop"],
    }]));

    await act(async () => rendered.result.current.run());
    act(() => vi.advanceTimersByTime(599_999));
    expect(port.getScan).toHaveBeenCalledOnce();
    await act(async () => {
      vi.advanceTimersByTime(1);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(port.getScan).toHaveBeenCalledTimes(2);
  });
});

afterEach(() => vi.useRealTimers());

function scan(clusterId: string): RightsizingScan {
  return {
    scope: {
      workspaceId: "workspace-a",
      clusterId,
      namespaces: ["shop"],
      freshness: "live",
    },
    namespaceScope: ["shop"],
    result: {
      availability: "unavailable",
      reasonCodes: ["rightsizing_observation_not_integrated"],
    },
    refreshAfterSeconds: 600,
  };
}

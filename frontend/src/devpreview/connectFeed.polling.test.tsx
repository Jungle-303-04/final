// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useClusterConnectionStatus } from "./connectFeed";

const { getClusterConnectStatusMock } = vi.hoisted(() => ({ getClusterConnectStatusMock: vi.fn() }));
vi.mock("../api/cluster-connect", () => ({ getClusterConnectStatus: getClusterConnectStatusMock }));

function setHidden(value: boolean) {
  Object.defineProperty(document, "hidden", { configurable: true, value });
  document.dispatchEvent(new Event("visibilitychange"));
}

describe("connection polling visibility gate", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    setHidden(false);
    getClusterConnectStatusMock.mockReset();
    getClusterConnectStatusMock.mockResolvedValue({
      status: "waiting", agent_version: null, connected_at: null,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("cancels the pending timer while hidden and resumes with exactly one request", async () => {
    const rendered = renderHook(() => useClusterConnectionStatus("game-server"));
    await act(async () => { await Promise.resolve(); });
    expect(getClusterConnectStatusMock).toHaveBeenCalledTimes(1);

    act(() => setHidden(true));
    await act(async () => { await vi.advanceTimersByTimeAsync(6_000); });
    expect(getClusterConnectStatusMock).toHaveBeenCalledTimes(1);

    act(() => setHidden(false));
    await act(async () => { await Promise.resolve(); });
    expect(getClusterConnectStatusMock).toHaveBeenCalledTimes(2);
    rendered.unmount();
  });
});

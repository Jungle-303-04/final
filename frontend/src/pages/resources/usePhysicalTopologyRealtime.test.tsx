// @vitest-environment jsdom

import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  type PhysicalTopologyRealtimeHandlers,
  type PhysicalTopologyRealtimePort,
} from "../../features/resources/physicalTopologyRealtimeContract";
import { PHYSICAL_TOPOLOGY } from "./ResourcesPage.physicalTestSupport";
import {
  usePhysicalTopologyRealtime,
  type PhysicalTopologyRealtimeResult,
} from "./usePhysicalTopologyRealtime";
import type { PhysicalTopologyFrame } from "./usePhysicalTopologyDataFrame";

afterEach(cleanup);

describe("physical topology realtime overlay", () => {
  it("connects the existing browser stream and applies snapshot then delta metrics immediately", async () => {
    const harness = realtimeHarness();
    const rendered = renderHook(() => usePhysicalTopologyRealtime({
      active: true,
      clusterId: "cluster-1",
      frame: readyFrame(),
      port: harness.port,
      workspaceId: "default",
    }));

    await waitFor(() => expect(harness.port.connect).toHaveBeenCalledOnce());
    expect(harness.subscriptions[0]).toEqual({
      workspaceId: "default",
      clusterId: "cluster-1",
    });

    act(() => {
      harness.latestHandlers().onMessage({
        type: "snapshot",
        seq: 3,
        state: {
          clusters: {
            "cluster-1": liveSummary(1.25, "kubelet_measurement_partial"),
          },
          resources: {
            "cluster-1/shop/pod/checkout-api-0": livePodValue(35, 25),
          },
        },
      });
      harness.latestHandlers().onStatusChange("connected");
    });

    expect(livePod(rendered.result.current).usagePercent).toBe(35);
    expect(livePod(rendered.result.current).cpuMillicores).toBe(210);
    expect(livePod(rendered.result.current).memoryMebibytes).toBe(128);
    expect(rendered.result.current.live).toMatchObject({
      status: "connected",
      actualIntervalSeconds: 1.25,
      degradedReason: "kubelet_measurement_partial",
    });

    act(() => {
      harness.latestHandlers().onMessage({
        type: "resource.delta",
        seq: 4,
        op: "replace",
        key: "cluster-1/shop/pod/checkout-api-0",
        value: livePodValue(85, 40),
      });
    });

    expect(livePod(rendered.result.current).usagePercent).toBe(85);
    expect(livePod(rendered.result.current).cpuMillicores).toBe(210);
    expect(rendered.result.current.live.updatedAt).toBeGreaterThan(0);

    rendered.unmount();
    expect(harness.disconnects[0]).toHaveBeenCalledOnce();
  });

  it("surfaces reconnecting and disconnected states while retaining the last measurement", async () => {
    const harness = realtimeHarness();
    const rendered = renderHook(() => usePhysicalTopologyRealtime({
      active: true,
      clusterId: "cluster-1",
      frame: readyFrame(),
      port: harness.port,
      workspaceId: "default",
    }));
    await waitFor(() => expect(harness.port.connect).toHaveBeenCalledOnce());

    act(() => {
      harness.latestHandlers().onMessage({
        type: "resource.delta",
        seq: 1,
        op: "replace",
        key: "cluster-1/shop/pod/checkout-api-0",
        value: livePodValue(72, 32),
      });
      harness.latestHandlers().onStatusChange("reconnecting");
    });
    expect(rendered.result.current.live.status).toBe("reconnecting");
    expect(livePod(rendered.result.current).usagePercent).toBe(72);

    act(() => harness.latestHandlers().onStatusChange("disconnected"));
    expect(rendered.result.current.live.status).toBe("disconnected");
    expect(livePod(rendered.result.current).usagePercent).toBe(72);
  });

  it("closes while hidden and creates a fresh snapshot connection when visible again", async () => {
    let visibility: DocumentVisibilityState = "visible";
    vi.spyOn(document, "visibilityState", "get").mockImplementation(() => visibility);
    const harness = realtimeHarness();
    const rendered = renderHook(() => usePhysicalTopologyRealtime({
      active: true,
      clusterId: "cluster-1",
      frame: readyFrame(),
      port: harness.port,
      workspaceId: "default",
    }));
    await waitFor(() => expect(harness.port.connect).toHaveBeenCalledOnce());

    act(() => {
      visibility = "hidden";
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(harness.disconnects[0]).toHaveBeenCalledOnce();
    expect(rendered.result.current.live.status).toBe("disconnected");

    act(() => {
      visibility = "visible";
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(harness.port.connect).toHaveBeenCalledTimes(2);
    expect(rendered.result.current.live.status).toBe("connecting");

    act(() => {
      harness.latestHandlers().onMessage({
        type: "snapshot",
        seq: 9,
        state: {
          clusters: { "cluster-1": liveSummary(1, null) },
          resources: {
            "cluster-1/shop/pod/checkout-api-0": livePodValue(88, 40),
          },
        },
      });
      harness.latestHandlers().onStatusChange("connected");
    });
    expect(livePod(rendered.result.current).usagePercent).toBe(88);
    expect(rendered.result.current.live.status).toBe("connected");
  });
});

function realtimeHarness() {
  const subscriptions: Array<{ workspaceId: string; clusterId: string }> = [];
  const handlers: PhysicalTopologyRealtimeHandlers[] = [];
  const disconnects: Array<ReturnType<typeof vi.fn>> = [];
  const port: PhysicalTopologyRealtimePort = {
    connect: vi.fn((subscription, nextHandlers) => {
      subscriptions.push(subscription);
      handlers.push(nextHandlers);
      const disconnect = vi.fn();
      disconnects.push(disconnect);
      return disconnect;
    }),
  };
  return {
    disconnects,
    handlers,
    latestHandlers() {
      const latest = handlers[handlers.length - 1];
      if (!latest) throw new Error("expected realtime handlers");
      return latest;
    },
    port,
    subscriptions,
  };
}

function readyFrame(): PhysicalTopologyFrame {
  return {
    phase: "ready",
    data: PHYSICAL_TOPOLOGY,
    failure: null,
    refreshFailure: null,
    refreshing: false,
    updatedAt: 1,
  };
}

function livePod(result: PhysicalTopologyRealtimeResult) {
  if (result.frame.phase !== "ready") throw new Error("expected ready topology");
  const pod = result.frame.data.pods.find((candidate) => candidate.name === "checkout-api-0");
  if (!pod) throw new Error("expected checkout pod");
  return pod;
}

function liveSummary(actualIntervalSeconds: number, degradedReason: string | null) {
  return {
    cluster_id: "cluster-1",
    window_ms: 1_000,
    pods_ready: 2,
    pods_total: 3,
    restart_delta: 0,
    rollout_phase: "idle",
    hot_pods: [],
    metrics_metadata: {
      source: "kubelet_stats_summary",
      actual_interval_seconds: actualIntervalSeconds,
      degraded_reason: degradedReason,
    },
  };
}

function livePodValue(cpuRequestPercent: number, memoryRequestPercent: number) {
  return {
    resource_type: "pod",
    kind: "Pod",
    name: "checkout-api-0",
    namespace: "shop",
    phase: "Running",
    health: "healthy",
    restarts: 0,
    cpu_mcores: 210,
    mem_mib: 128,
    cpu_request_pct: cpuRequestPercent,
    mem_request_pct: memoryRequestPercent,
    observed_at: "2026-07-15T04:00:00Z",
    metrics_metadata: {
      source: "kubelet_stats_summary",
      actual_interval_seconds: 1,
      degraded_reason: null,
    },
  };
}

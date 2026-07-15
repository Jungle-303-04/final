// @vitest-environment jsdom

import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  type PhysicalTopologyRealtimeHandlers,
  type PhysicalTopologyRealtimePort,
} from "../../features/resources/physicalTopologyRealtimeContract";
import { PHYSICAL_TOPOLOGY } from "./ResourcesPage.physicalTestSupport";
import { POD_LIST } from "./ResourcesPage.testFixtures";
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
    expect(livePod(rendered.result.current).cpuRequestMillicores).toBe(600);
    expect(livePod(rendered.result.current).memoryMebibytes).toBe(128);
    expect(livePod(rendered.result.current).memoryRequestMebibytes).toBe(512);
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
        type: "snapshot",
        seq: 1,
        state: {
          resources: {
            "cluster-1/shop/pod/checkout-api-0": livePodValue(72, 32),
          },
        },
      });
      harness.latestHandlers().onStatusChange("reconnecting");
    });
    expect(rendered.result.current.live.status).toBe("reconnecting");
    expect(livePod(rendered.result.current).usagePercent).toBe(72);

    act(() => harness.latestHandlers().onStatusChange("disconnected"));
    expect(rendered.result.current.live.status).toBe("disconnected");
    expect(livePod(rendered.result.current).usagePercent).toBe(72);
  });

  it("clears request-relative usage when either request denominator is missing", async () => {
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
        type: "snapshot",
        seq: 1,
        state: {
          resources: {
            "cluster-1/shop/pod/checkout-api-0": {
              ...livePodValue(35, 25),
              cpu_request_mcores: null,
              cpu_request_pct: null,
            },
          },
        },
      });
    });

    expect(livePod(rendered.result.current).usagePercent).toBeNull();
    expect(livePod(rendered.result.current).cpuRequestMillicores).toBeNull();
    expect(livePod(rendered.result.current).memoryRequestMebibytes).toBe(512);
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

  it("projects one measured sample into both the graph pod and table row", async () => {
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
        type: "snapshot",
        seq: 1,
        state: {
          clusters: { "cluster-1": liveSummary(1, null) },
          resources: {
            "cluster-1/shop/pod/checkout-api-0": livePodValue(64, 32, {
              cpuMillicores: 384,
              memoryMebibytes: 196,
              observedAt: "2026-07-15T04:00:00.000Z",
            }),
          },
        },
      });
    });

    const graph = livePod(rendered.result.current);
    const table = rendered.result.current.selectTableRows([tablePodFixture()])[0]!;
    expect(graph.cpuMillicores).toBe(384);
    expect(graph.memoryMebibytes).toBe(196);
    expect(table.facts.type).toBe("pod");
    if (table.facts.type !== "pod") throw new Error("expected pod row");
    expect(table.facts.cpuMillicores).toBe(graph.cpuMillicores);
    expect(table.facts.memoryMebibytes).toBe(graph.memoryMebibytes);
    expect(table.observedAt).toBe("2026-07-15T04:00:00.000Z");
  });

  it("keeps graph and table frozen at replay time while newer stream deltas are stored", async () => {
    const harness = realtimeHarness();
    const rows = [tablePodFixture()];
    const rendered = renderHook(
      ({ replayAtMs }: { replayAtMs: number | undefined }) =>
        usePhysicalTopologyRealtime({
          active: true,
          clusterId: "cluster-1",
          frame: readyFrame(),
          port: harness.port,
          replayAtMs,
          rows,
          workspaceId: "default",
        }),
      { initialProps: { replayAtMs: undefined as number | undefined } },
    );
    await waitFor(() => expect(harness.port.connect).toHaveBeenCalledOnce());

    act(() => {
      harness.latestHandlers().onMessage({
        type: "snapshot",
        seq: 1,
        state: {
          clusters: { "cluster-1": liveSummary(1, null) },
          resources: {
            "cluster-1/shop/pod/checkout-api-0": livePodValue(30, 15, {
              cpuMillicores: 180,
              memoryMebibytes: 96,
              observedAt: "2026-07-15T04:00:00.000Z",
            }),
          },
        },
      });
      harness.latestHandlers().onMessage({
        type: "resource.delta",
        seq: 2,
        op: "replace",
        key: "cluster-1/shop/pod/checkout-api-0",
        value: livePodValue(70, 35, {
          cpuMillicores: 420,
          memoryMebibytes: 160,
          observedAt: "2026-07-15T04:00:01.000Z",
        }),
      });
    });

    rendered.rerender({ replayAtMs: Date.parse("2026-07-15T04:00:00.500Z") });
    await waitFor(() => expect(rendered.result.current.replay.status).toBe("ready"));

    act(() => {
      harness.latestHandlers().onMessage({
        type: "resource.delta",
        seq: 3,
        op: "replace",
        key: "cluster-1/shop/pod/checkout-api-0",
        value: livePodValue(95, 47.5, {
          cpuMillicores: 570,
          memoryMebibytes: 220,
          observedAt: "2026-07-15T04:00:02.000Z",
        }),
      });
    });

    expect(livePod(rendered.result.current).cpuMillicores).toBe(180);
    const replayTable = rendered.result.current.selectTableRows([tablePodFixture()])[0]!;
    expect(replayTable.facts.type).toBe("pod");
    if (replayTable.facts.type !== "pod") throw new Error("expected pod row");
    expect(replayTable.facts.cpuMillicores).toBe(180);
    expect(replayTable.observedAt).toBe("2026-07-15T04:00:00.000Z");

    rendered.rerender({ replayAtMs: undefined });
    await waitFor(() => expect(rendered.result.current.replay.status).toBe("live"));
    expect(livePod(rendered.result.current).cpuMillicores).toBe(570);
    const liveTable = rendered.result.current.selectTableRows([tablePodFixture()])[0]!;
    expect(liveTable.facts.type).toBe("pod");
    if (liveTable.facts.type !== "pod") throw new Error("expected pod row");
    expect(liveTable.facts.cpuMillicores).toBe(570);
    expect(harness.port.connect).toHaveBeenCalledOnce();
  });

  it("keeps node CPU and memory aligned with the replayed graph and table time", async () => {
    const harness = realtimeHarness();
    const rows = [tablePodFixture()];
    const rendered = renderHook(
      (props: { frame: PhysicalTopologyFrame; replayAtMs: number | undefined }) =>
        usePhysicalTopologyRealtime({
          active: true,
          clusterId: "cluster-1",
          frame: props.frame,
          port: harness.port,
          replayAtMs: props.replayAtMs,
          rows,
          workspaceId: "default",
        }),
      {
        initialProps: {
          frame: frameWithServerMetrics(24, 41, "2026-07-15T04:00:00.000Z"),
          replayAtMs: undefined as number | undefined,
        },
      },
    );
    await waitFor(() => expect(harness.port.connect).toHaveBeenCalledOnce());

    act(() => harness.latestHandlers().onMessage({
      type: "snapshot",
      seq: 1,
      state: {
        resources: {
          "cluster-1/shop/pod/checkout-api-0": livePodValue(30, 15, {
            cpuMillicores: 180,
            observedAt: "2026-07-15T04:00:00.000Z",
          }),
        },
      },
    }));
    rendered.rerender({
      frame: frameWithServerMetrics(83, 67, "2026-07-15T04:00:02.000Z"),
      replayAtMs: undefined,
    });
    act(() => harness.latestHandlers().onMessage({
      type: "resource.delta",
      seq: 2,
      op: "replace",
      key: "cluster-1/shop/pod/checkout-api-0",
      value: livePodValue(80, 40, {
        cpuMillicores: 480,
        observedAt: "2026-07-15T04:00:02.000Z",
      }),
    }));

    rendered.rerender({
      frame: frameWithServerMetrics(83, 67, "2026-07-15T04:00:02.000Z"),
      replayAtMs: Date.parse("2026-07-15T04:00:00.500Z"),
    });
    await waitFor(() => expect(rendered.result.current.replay.status).toBe("ready"));
    if (rendered.result.current.frame.phase !== "ready") throw new Error("expected frame");
    expect(rendered.result.current.frame.data.servers[0]).toMatchObject({
      cpuPercent: 24,
      memoryPercent: 41,
    });
    expect(rendered.result.current.frame.data.metricsObservedAt)
      .toBe("2026-07-15T04:00:00.000Z");
    expect(livePod(rendered.result.current).cpuMillicores).toBe(180);
    const replayRow = rendered.result.current.selectTableRows(rows)[0];
    expect(replayRow?.facts).toMatchObject({ type: "pod", cpuMillicores: 180 });
  });

  it("restores historical pod membership in both graph and table while hiding newer pods", async () => {
    const harness = realtimeHarness();
    const podA = graphPodNamed("checkout-api-a");
    const podB = graphPodNamed("checkout-api-b");
    const rowA = tablePodNamed("checkout-api-a");
    const rowB = tablePodNamed("checkout-api-b");
    const rendered = renderHook(
      (props: {
        frame: PhysicalTopologyFrame;
        replayAtMs: number | undefined;
        rows: readonly ReturnType<typeof tablePodFixture>[];
      }) => usePhysicalTopologyRealtime({
        active: true,
        clusterId: "cluster-1",
        frame: props.frame,
        port: harness.port,
        replayAtMs: props.replayAtMs,
        rows: props.rows,
        workspaceId: "default",
      }),
      {
        initialProps: {
          frame: frameWithPods([podA]),
          replayAtMs: undefined as number | undefined,
          rows: [rowA],
        },
      },
    );
    await waitFor(() => expect(harness.port.connect).toHaveBeenCalledOnce());

    act(() => harness.latestHandlers().onMessage({
      type: "snapshot",
      seq: 1,
      state: {
        resources: {
          "cluster-1/shop/pod/checkout-api-a": {
            ...livePodValue(30, 15, { observedAt: "2026-07-15T04:00:00.000Z" }),
            name: "checkout-api-a",
          },
        },
      },
    }));
    rendered.rerender({
      frame: frameWithPods([podA]),
      replayAtMs: Date.parse("2026-07-15T04:00:00.500Z"),
      rows: [rowA],
    });
    await waitFor(() => expect(rendered.result.current.replay.status).toBe("ready"));

    act(() => {
      harness.latestHandlers().onMessage({
        type: "resource.delta",
        seq: 2,
        op: "remove",
        key: "cluster-1/shop/pod/checkout-api-a",
        value: null,
        observed_at: "2026-07-15T04:00:01.000Z",
      });
      harness.latestHandlers().onMessage({
        type: "resource.delta",
        seq: 3,
        op: "replace",
        key: "cluster-1/shop/pod/checkout-api-b",
        value: {
          ...livePodValue(80, 40, { observedAt: "2026-07-15T04:00:02.000Z" }),
          name: "checkout-api-b",
        },
      });
    });
    rendered.rerender({
      frame: frameWithPods([podB]),
      replayAtMs: Date.parse("2026-07-15T04:00:00.500Z"),
      rows: [rowB],
    });

    await waitFor(() => {
      if (rendered.result.current.frame.phase !== "ready") throw new Error("expected frame");
      expect(rendered.result.current.frame.data.pods.map((pod) => pod.name))
        .toEqual(["checkout-api-a"]);
    });
    expect(rendered.result.current.selectTableRows([rowB]).map((row) => row.name))
      .toEqual(["checkout-api-a"]);
  });

  it("marks a duplicate sequence degraded, blocks replay, and reconnects for a snapshot", async () => {
    const harness = realtimeHarness();
    const rendered = renderHook(() => usePhysicalTopologyRealtime({
      active: true,
      clusterId: "cluster-1",
      frame: readyFrame(),
      port: harness.port,
      replayAtMs: Date.parse("2026-07-15T04:00:00.000Z"),
      workspaceId: "default",
    }));
    await waitFor(() => expect(harness.port.connect).toHaveBeenCalledOnce());
    act(() => {
      harness.latestHandlers().onMessage({
        type: "snapshot",
        seq: 1,
        state: {
          resources: {
            "cluster-1/shop/pod/checkout-api-0": livePodValue(30, 15),
          },
        },
      });
      harness.latestHandlers().onMessage({
        type: "resource.delta",
        seq: 1,
        op: "replace",
        key: "cluster-1/shop/pod/checkout-api-0",
        value: livePodValue(50, 25, { observedAt: "2026-07-15T04:00:01.000Z" }),
      });
    });

    await waitFor(() => expect(harness.port.connect).toHaveBeenCalledTimes(2));
    expect(harness.disconnects[0]).toHaveBeenCalledOnce();
    expect(rendered.result.current.live).toMatchObject({
      status: "reconnecting",
      degradedReason: "stream-sequence-integrity",
    });
    expect(rendered.result.current.replay).toMatchObject({
      status: "gap",
      blockedReason: "sequence-integrity",
      availableFromMs: null,
      availableToMs: null,
    });
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

function frameWithPods(
  pods: Extract<PhysicalTopologyFrame, { phase: "ready" }>["data"]["pods"],
): PhysicalTopologyFrame {
  const base = readyFrame();
  if (base.phase !== "ready") throw new Error("expected ready frame fixture");
  return {
    ...base,
    data: { ...PHYSICAL_TOPOLOGY, pods },
  };
}

function frameWithServerMetrics(
  cpuPercent: number,
  memoryPercent: number,
  metricsObservedAt: string,
): PhysicalTopologyFrame {
  const base = readyFrame();
  if (base.phase !== "ready") throw new Error("expected ready frame fixture");
  return {
    ...base,
    data: {
      ...base.data,
      metricsObservedAt,
      servers: base.data.servers.map((server, index) => index === 0
        ? { ...server, cpuPercent, memoryPercent }
        : server),
    },
  };
}

function graphPodNamed(name: string) {
  return {
    ...PHYSICAL_TOPOLOGY.pods[0]!,
    id: `pod:shop/${name}`,
    name,
  };
}

function livePod(result: PhysicalTopologyRealtimeResult) {
  if (result.frame.phase !== "ready") throw new Error("expected ready topology");
  const pod = result.frame.data.pods.find((candidate) => candidate.name === "checkout-api-0");
  if (!pod) throw new Error("expected checkout pod");
  return pod;
}

function tablePodFixture() {
  return {
    ...POD_LIST.items[0]!,
    facts: {
      type: "pod" as const,
      phase: "Running",
      nodeName: "worker-a",
      owner: null,
      readiness: { ready: 1, total: 1 },
      restartCount: 0,
      cpuMillicores: 30,
      memoryMebibytes: 64,
      podIp: null,
      hostIp: null,
      waitingReasons: [],
      terminatedReasons: [],
    },
  };
}

function tablePodNamed(name: string): ReturnType<typeof tablePodFixture> {
  return {
    ...tablePodFixture(),
    id: `pod:shop/${name}`,
    inventoryKey: `pod:shop/${name}`,
    uid: `pod:shop/${name}`,
    name,
  };
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

function livePodValue(
  cpuRequestPercent: number,
  memoryRequestPercent: number,
  overrides: {
    cpuMillicores?: number;
    memoryMebibytes?: number;
    observedAt?: string;
  } = {},
) {
  return {
    resource_type: "pod",
    kind: "Pod",
    name: "checkout-api-0",
    namespace: "shop",
    phase: "Running",
    health: "healthy",
    restarts: 0,
    cpu_mcores: overrides.cpuMillicores ?? 210,
    cpu_request_mcores: 600,
    mem_mib: overrides.memoryMebibytes ?? 128,
    mem_request_mib: 512,
    cpu_request_pct: cpuRequestPercent,
    mem_request_pct: memoryRequestPercent,
    observed_at: overrides.observedAt ?? "2026-07-15T04:00:00Z",
    metrics_metadata: {
      source: "kubelet_stats_summary",
      actual_interval_seconds: 1,
      degraded_reason: null,
    },
  };
}

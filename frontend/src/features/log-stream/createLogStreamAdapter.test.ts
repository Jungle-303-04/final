import { describe, expect, it, vi } from "vitest";

import { createLogStreamAdapter } from "./createLogStreamAdapter";

describe("log stream adapter", () => {
  it("maps pod identities and strict endpoint events", () => {
    const onEvent = vi.fn();
    const close = vi.fn();
    const openPodLogStream = vi.fn((_cluster, _namespace, _name, _container, handlers) => {
      handlers.onEvent({
        type: "connected",
        stream_id: "stream-1",
        containers: ["app", "sidecar"],
      });
      handlers.onEvent({
        type: "log",
        id: "line-1",
        observed_at: "2026-07-14T08:00:00+00:00",
        pod: "checkout",
        container: "app",
        line: "ready",
        line_truncated: false,
      });
      handlers.onEvent({ type: "end", reason: "window_complete", diagnostic: null });
      return close;
    });
    const port = createLogStreamAdapter({
      openPodLogStream,
      openScheduledWorkloadRunLogStream: vi.fn(),
      openWorkloadLogStream: vi.fn(),
    });

    const dispose = port.open({
      type: "pod",
      clusterId: "cluster-1",
      namespace: "shop",
      name: "checkout",
      container: null,
    }, { onEvent, onFailure: vi.fn() });

    expect(openPodLogStream).toHaveBeenCalledWith(
      "cluster-1",
      "shop",
      "checkout",
      null,
      expect.any(Object),
    );
    expect(onEvent).toHaveBeenNthCalledWith(1, {
      type: "connected",
      streamId: "stream-1",
      containers: ["app", "sidecar"],
    });
    expect(onEvent).toHaveBeenNthCalledWith(2, expect.objectContaining({
      type: "log",
      observedAt: "2026-07-14T08:00:00+00:00",
      line: "ready",
    }));
    expect(onEvent).toHaveBeenNthCalledWith(3, {
      type: "end",
      reason: "window_complete",
      diagnostic: null,
    });
    dispose();
    expect(close).toHaveBeenCalledTimes(1);
  });

  it("maps transport authorization failures", () => {
    const onFailure = vi.fn();
    const port = createLogStreamAdapter({
      openPodLogStream: vi.fn((_cluster, _namespace, _name, _container, handlers) => {
        handlers.onFailure({ kind: "unauthorized", status: 401 });
        return vi.fn();
      }),
      openScheduledWorkloadRunLogStream: vi.fn(),
      openWorkloadLogStream: vi.fn(),
    });
    port.open({
      type: "pod",
      clusterId: "cluster-1",
      namespace: "shop",
      name: "checkout",
      container: null,
    }, { onEvent: vi.fn(), onFailure });
    expect(onFailure.mock.calls[0]?.[0]).toMatchObject({ code: "unauthorized" });
  });

  it("routes an owner-scoped run key only through the scheduled endpoint", () => {
    const openScheduledWorkloadRunLogStream = vi.fn(() => vi.fn());
    const port = createLogStreamAdapter({
      openPodLogStream: vi.fn(),
      openScheduledWorkloadRunLogStream,
      openWorkloadLogStream: vi.fn(),
    });

    port.open({
      type: "scheduled-run",
      clusterId: "cluster-1",
      kind: "CronJob",
      namespace: "shop",
      name: "nightly",
      runKey: "uid-nightly-101",
    }, { onEvent: vi.fn(), onFailure: vi.fn() });

    expect(openScheduledWorkloadRunLogStream).toHaveBeenCalledWith(
      "cluster-1",
      "CronJob",
      "shop",
      "nightly",
      "uid-nightly-101",
      expect.any(Object),
    );
  });
});

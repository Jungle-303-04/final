import { describe, expect, it, vi } from "vitest";

import { createLogStreamAdapter } from "./createLogStreamAdapter";

describe("log stream adapter", () => {
  it("maps pod identities and strict endpoint events", () => {
    const onEvent = vi.fn();
    const close = vi.fn();
    const openPodLogStream = vi.fn((_cluster, _namespace, _name, _container, handlers) => {
      handlers.onEvent({ type: "connected", stream_id: "stream-1" });
      handlers.onEvent({
        type: "log",
        id: "line-1",
        observed_at: "2026-07-14T08:00:00+00:00",
        pod: "checkout",
        container: "app",
        line: "ready",
        line_truncated: false,
      });
      handlers.onEvent({ type: "end", reason: "window_complete" });
      return close;
    });
    const port = createLogStreamAdapter({
      openPodLogStream,
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
    expect(onEvent).toHaveBeenNthCalledWith(1, { type: "connected", streamId: "stream-1" });
    expect(onEvent).toHaveBeenNthCalledWith(2, expect.objectContaining({
      type: "log",
      observedAt: "2026-07-14T08:00:00+00:00",
      line: "ready",
    }));
    expect(onEvent).toHaveBeenNthCalledWith(3, {
      type: "end",
      reason: "window_complete",
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
});

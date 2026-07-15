import { describe, expect, it, vi } from "vitest";

import type { OperationEvent, OperationEventsPort } from "./operationEventsContract";
import {
  createOperationStatusStore,
  type OperationStatusStoreRuntime,
} from "./OperationStatusStore";

describe("operation status store", () => {
  it("coalesces 1,000 progress frames into one visible update", async () => {
    const frame = createFrameRuntime();
    const port: OperationEventsPort = {
      async *subscribeOperationEvents() {
        for (let sequence = 1; sequence <= 1_000; sequence += 1) {
          yield event(sequence, "progress");
        }
        await new Promise(() => undefined);
      },
    };
    const store = createOperationStatusStore(port, undefined, frame.runtime);
    const onChange = vi.fn();
    store.subscribe("command-1", onChange);

    store.start("command-1");
    onChange.mockClear();
    await eventually(() => expect(store.getSnapshot("command-1").sequence).toBe(1_000));

    expect(frame.pending()).toHaveLength(1);
    expect(onChange).not.toHaveBeenCalled();

    frame.flush();

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(store.getSnapshot("command-1")).toMatchObject({
      status: "running",
      sequence: 1_000,
    });
    store.dispose();
  });

  it("notifies every subscriber once and never lets an event overwrite a terminal result", async () => {
    const port: OperationEventsPort = {
      async *subscribeOperationEvents() {
        yield event(1, "progress");
        yield event(2, "completed");
        yield event(3, "failed");
      },
    };
    const store = createOperationStatusStore(port);
    const first = vi.fn();
    const second = vi.fn();
    store.subscribe("command-1", first);
    store.subscribe("command-1", second);

    store.start("command-1");
    first.mockClear();
    second.mockClear();
    await eventually(() => expect(store.getSnapshot("command-1").status).toBe("completed"));

    expect(store.getSnapshot("command-1")).toMatchObject({
      status: "completed",
      sequence: 2,
    });
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
    store.dispose();
  });

  it("keeps a failed observation visible and reobserves the stream without replaying the command", async () => {
    let subscriptions = 0;
    const port: OperationEventsPort = {
      async *subscribeOperationEvents(_commandId, subscription) {
        subscriptions += 1;
        if (subscriptions === 1) {
          subscription?.onLifecycle?.({ state: "failed", failure: "forbidden" });
          throw new Error("permission denied");
        }
        yield event(1, "completed");
      },
    };
    const store = createOperationStatusStore(port);

    store.start("command-1");
    await eventually(() => expect(store.getSnapshot("command-1").status).toBe("forbidden"));

    store.reobserve("command-1");
    await eventually(() => expect(store.getSnapshot("command-1").status).toBe("completed"));

    expect(subscriptions).toBe(2);
    store.dispose();
  });

  it("holds background progress to the latest state and flushes it when the tab becomes visible", async () => {
    const visibility = createVisibilityRuntime(false);
    const port: OperationEventsPort = {
      async *subscribeOperationEvents() {
        yield event(1, "progress");
        yield event(2, "log");
        await new Promise(() => undefined);
      },
    };
    const store = createOperationStatusStore(port, undefined, visibility.runtime);
    const onChange = vi.fn();
    store.subscribe("command-1", onChange);

    store.start("command-1");
    await eventually(() => expect(store.getSnapshot("command-1").sequence).toBe(2));

    expect(onChange).not.toHaveBeenCalled();
    visibility.setVisible(true);

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(store.getSnapshot("command-1")).toMatchObject({ status: "running", sequence: 2 });
    store.dispose();
  });

  it("bounds terminal history through the injected retention policy without stopping active observations", async () => {
    const port: OperationEventsPort = {
      async *subscribeOperationEvents(commandId) {
        yield {
          ...event(1, "completed"),
          commandId,
        };
      },
    };
    const store = createOperationStatusStore(port, {
      maxTerminalCommands: 1,
      terminalRetentionMs: 60_000,
    });

    store.start("command-1");
    await eventually(() => expect(store.getSnapshot("command-1").status).toBe("completed"));
    store.start("command-2");
    await eventually(() => expect(store.getSnapshot("command-2").status).toBe("completed"));

    expect(store.getSnapshot("command-1").status).toBe("idle");
    expect(store.getSnapshot("command-2").status).toBe("completed");
    store.dispose();
  });
});

function event(sequence: number, kind: OperationEvent["kind"]): OperationEvent {
  return {
    commandId: "command-1",
    sequence,
    kind,
    payload: { status: kind },
    occurredAt: "2026-07-15T00:00:00Z",
  };
}

function createFrameRuntime() {
  let callbacks: FrameRequestCallback[] = [];
  const runtime: Partial<OperationStatusStoreRuntime> = {
    requestFrame(callback) {
      callbacks.push(callback);
      return callbacks.length;
    },
    cancelFrame() {},
  };
  return {
    runtime,
    pending: () => callbacks,
    flush: () => {
      const pending = callbacks;
      callbacks = [];
      pending.forEach((callback) => callback(0));
    },
  };
}

function createVisibilityRuntime(initiallyVisible: boolean) {
  let visible = initiallyVisible;
  let listener: (() => void) | null = null;
  return {
    runtime: {
      isVisible: () => visible,
      subscribeVisibilityChange(onChange: () => void) {
        listener = onChange;
        return () => {
          listener = null;
        };
      },
    } satisfies Partial<OperationStatusStoreRuntime>,
    setVisible(next: boolean) {
      visible = next;
      listener?.();
    },
  };
}

async function eventually(assertion: () => void): Promise<void> {
  let failure: unknown;
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      assertion();
      return;
    } catch (error) {
      failure = error;
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }
  throw failure;
}

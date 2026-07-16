import { describe, expect, it, vi } from "vitest";

import type { OperationEvent, OperationEventsPort } from "./operationEventsContract";
import {
  createOperationStatusStore,
  type OperationStatusRetentionPolicy,
} from "./OperationStatusStore";

describe("operation status P1 state boundaries", () => {
  it("aborts and freezes an invalid gap before a later event can overwrite it", async () => {
    let signal: AbortSignal | undefined;
    const port: OperationEventsPort = {
      async *subscribeOperationEvents(_commandId, subscription) {
        signal = subscription?.signal;
        yield event(2, "progress");
        yield event(1, "progress");
      },
    };
    const store = createOperationStatusStore(port);

    store.start("command-1");
    await flushMicrotasks();

    expect(signal?.aborted).toBe(true);
    expect(store.getSnapshot("command-1")).toMatchObject({ status: "invalid", sequence: null });
    store.dispose();
  });

  it("prunes terminal and empty snapshots on injected time and cache bounds", async () => {
    vi.useFakeTimers();
    let now = 0;
    const policy: OperationStatusRetentionPolicy & { maxEmptySnapshots: number } = {
      maxEmptySnapshots: 1,
      maxTerminalCommands: 2,
      terminalRetentionMs: 50,
    };
    const store = createOperationStatusStore({
      async *subscribeOperationEvents() {
        yield event(1, "completed");
      },
    }, policy, { now: () => now });
    const firstEmpty = store.getSnapshot("empty-1");
    store.getSnapshot("empty-2");
    expect(store.getSnapshot("empty-1")).not.toBe(firstEmpty);

    store.start("command-1");
    await flushMicrotasks();
    expect(store.getSnapshot("command-1").status).toBe("completed");
    now = 50;
    await vi.advanceTimersByTimeAsync(50);

    expect(store.getSnapshot("command-1").status).toBe("idle");
    store.dispose();
  });
});

function event(sequence: number, kind: OperationEvent["kind"]): OperationEvent {
  return {
    commandId: "command-1",
    sequence,
    kind,
    payload: {},
    occurredAt: "2026-07-15T00:00:00Z",
  };
}

async function flushMicrotasks(): Promise<void> {
  for (let index = 0; index < 8; index += 1) await Promise.resolve();
}

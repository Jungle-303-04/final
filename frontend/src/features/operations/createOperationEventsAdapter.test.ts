import { describe, expect, it, vi } from "vitest";

import { createOperationEventsAdapter } from "./createOperationEventsAdapter";
import type { OperationEvent } from "./operationEventsContract";

describe("operation events adapter", () => {
  it("maps the injected endpoint contract to the shared operation-events port", async () => {
    const controller = new AbortController();
    const subscribeCommandOperationEvents = vi.fn(async function* () {
      yield {
        command_id: "command-1",
        sequence: 1,
        kind: "progress" as const,
        payload: { status: "running" },
        occurred_at: "2026-07-15T00:00:00Z",
      };
    });
    const port = createOperationEventsAdapter({ subscribeCommandOperationEvents });
    const subscription = { signal: controller.signal };

    const events: OperationEvent[] = [];
    for await (const event of port.subscribeOperationEvents("command-1", subscription)) {
      events.push(event);
    }

    expect(events).toEqual([{
      commandId: "command-1",
      sequence: 1,
      kind: "progress",
      payload: { status: "running" },
      occurredAt: "2026-07-15T00:00:00Z",
    }]);
    expect(subscribeCommandOperationEvents).toHaveBeenCalledWith("command-1", subscription);
  });
});

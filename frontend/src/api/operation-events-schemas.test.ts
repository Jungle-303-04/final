import { describe, expect, it } from "vitest";

import { commandOperationEventSchema } from "./operation-events-schemas";

describe("command operation event schema", () => {
  it("accepts the shared durable event wire contract and rejects undeclared fields", () => {
    const event = {
      command_id: "command-1",
      sequence: 1,
      kind: "progress",
      payload: { status: "running" },
      occurred_at: "2026-07-15T00:00:00Z",
    };

    expect(commandOperationEventSchema.parse(event)).toEqual(event);
    expect(() => commandOperationEventSchema.parse({ ...event, unexpected: true })).toThrow();
  });

  it("accepts a terminal cooperative cancellation event", () => {
    expect(commandOperationEventSchema.parse({
      command_id: "command-1",
      sequence: 2,
      kind: "cancelled",
      payload: { status: "cancelled" },
      occurred_at: "2026-07-16T00:00:00Z",
    }).kind).toBe("cancelled");
  });
});

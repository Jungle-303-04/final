import { describe, expect, it, vi } from "vitest";

import { subscribeCommandOperationEvents } from "./operation-events";

function sseResponse(data: unknown): Response {
  const frame = `id: 1\nevent: operation\ndata: ${JSON.stringify(data)}\n\n`;
  return new Response(new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(frame));
      controller.close();
    },
  }), {
    status: 200,
    headers: { "content-type": "text/event-stream" },
  });
}

describe("command operation events API", () => {
  it("consumes the authenticated SSE operation contract without polling", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(sseResponse({
      command_id: "command-1",
      sequence: 1,
      kind: "completed",
      payload: { status: "completed" },
      occurred_at: "2026-07-15T00:00:00Z",
    }));

    const events: unknown[] = [];
    for await (const event of subscribeCommandOperationEvents("command-1")) {
      events.push(event);
    }

    expect(events).toEqual([{
      command_id: "command-1",
      sequence: 1,
      kind: "completed",
      payload: { status: "completed" },
      occurred_at: "2026-07-15T00:00:00Z",
    }]);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/commands/command-1/events",
      expect.objectContaining({ credentials: "include" }),
    );
  });

  it("rejects an invalid command identifier before making a streaming request", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    const iterator = subscribeCommandOperationEvents(" ")[Symbol.asyncIterator]();

    await expect(iterator.next()).rejects.toThrow(TypeError);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

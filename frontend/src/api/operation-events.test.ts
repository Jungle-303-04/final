import { beforeEach, describe, expect, it, vi } from "vitest";

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

function sseFramesResponse(frames: readonly { id: number; data: unknown }[]): Response {
  const body = frames
    .map(({ id, data }) => `id: ${id}\nevent: operation\ndata: ${JSON.stringify(data)}\n\n`)
    .join("");
  return new Response(body, {
    status: 200,
    headers: { "content-type": "text/event-stream" },
  });
}

describe("command operation events API", () => {
  beforeEach(() => vi.restoreAllMocks());

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

  it("reconnects transiently from the durable cursor and suppresses replay duplicates", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(sseResponse({
        command_id: "command-1",
        sequence: 1,
        kind: "progress",
        payload: { status: "running" },
        occurred_at: "2026-07-15T00:00:00Z",
      }))
      .mockResolvedValueOnce(sseFramesResponse([
        {
          id: 1,
          data: {
            command_id: "command-1",
            sequence: 1,
            kind: "progress",
            payload: { status: "running" },
            occurred_at: "2026-07-15T00:00:00Z",
          },
        },
        {
          id: 2,
          data: {
            command_id: "command-1",
            sequence: 2,
            kind: "completed",
            payload: { status: "completed" },
            occurred_at: "2026-07-15T00:00:01Z",
          },
        },
      ]));

    const sequences: number[] = [];
    for await (const event of subscribeCommandOperationEvents("command-1")) {
      sequences.push(event.sequence);
    }

    expect(sequences).toEqual([1, 2]);
    expect(globalThis.fetch).toHaveBeenLastCalledWith(
      "/api/commands/command-1/events",
      expect.objectContaining({
        headers: expect.objectContaining({ "last-event-id": "1" }),
      }),
    );
  });

  it("fails terminally for an authenticated or invalid-request stream error instead of retrying", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ detail: "not allowed" }), {
        status: 403,
        headers: { "content-type": "application/json" },
      }),
    );
    const controller = new AbortController();
    const iterator = subscribeCommandOperationEvents("command-1", controller.signal)[Symbol.asyncIterator]();
    const outcome = await Promise.race([
      iterator.next().then(
        () => "resolved",
        (error: unknown) => error,
      ),
      new Promise<"timed-out">((resolve) => setTimeout(() => resolve("timed-out"), 40)),
    ]);
    controller.abort();

    expect(outcome).toMatchObject({ kind: "forbidden", status: 403 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

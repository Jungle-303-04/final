import { beforeEach, describe, expect, it, vi } from "vitest";

import { openPodLogStream, openWorkloadLogStream } from "./log-stream";
import { MAX_SSE_FRAME_LENGTH, parseSseFrames } from "../shared/streaming/sse";

describe("log stream API", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("encodes exact pod identity and parses strict default-message envelopes", async () => {
    const onEvent = vi.fn();
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(sseResponse([
      { type: "connected", stream_id: "stream-1" },
      {
        type: "log",
        id: "line-1",
        observed_at: "2026-07-14T08:00:00+00:00",
        pod: "checkout api",
        container: "app",
        line: "plain <script> text",
        line_truncated: false,
      },
      { type: "end", reason: "complete" },
    ]));

    const close = openPodLogStream("cluster-1", "shop", "checkout api", null, {
      onEvent,
      onFailure: vi.fn(),
    });
    await vi.waitFor(() => expect(onEvent).toHaveBeenCalledTimes(3));
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/pods/shop/checkout%20api/logs/stream?cluster_id=cluster-1",
      expect.objectContaining({
        credentials: "include",
        headers: expect.any(Headers),
        method: "GET",
      }),
    );
    expect(onEvent.mock.calls[1]?.[0].line).toBe("plain <script> text");
    close();
  });

  it("encodes workload kind and reports malformed events without reconnecting", async () => {
    const onFailure = vi.fn();
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(
      'data: {"type":"log","line":"missing strict fields"}\n\n',
      { headers: { "content-type": "text/event-stream" } },
    ));

    openWorkloadLogStream("cluster/one", "deployments", "shop", "checkout", {
      onEvent: vi.fn(),
      onFailure,
    });
    await vi.waitFor(() => expect(onFailure).toHaveBeenCalledTimes(1));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "/api/workloads/deployments/shop/checkout/logs/stream?cluster_id=cluster%2Fone",
    );
    expect(onFailure.mock.calls[0]?.[0]).toMatchObject({ kind: "invalid-payload" });
  });

  it("handles heartbeat comments, chunk remainders, and preserves SSE event metadata", () => {
    expect(parseSseFrames(': heartbeat\n\ndata: {"type":"end","reason":"done"}\n\n'))
      .toEqual({ frames: [{ id: null, event: null, data: '{"type":"end","reason":"done"}' }], remainder: "" });
    expect(parseSseFrames('data: {"type":"connected"')).toEqual({
      frames: [],
      remainder: 'data: {"type":"connected"',
    });
    expect(parseSseFrames("event: operation\nid: 1\ndata: {}\n\n"))
      .toEqual({ frames: [{ id: "1", event: "operation", data: "{}" }], remainder: "" });
    expect(parseSseFrames('data: {"type":"end","reason":"done"}\r')).toEqual({
      frames: [],
      remainder: 'data: {"type":"end","reason":"done"}\r',
    });
    expect(parseSseFrames('data: {"type":"end","reason":"done"}\r\n\r\n')).toEqual({
      frames: [{ id: null, event: null, data: '{"type":"end","reason":"done"}' }],
      remainder: "",
    });
    expect(() => parseSseFrames(`data: ${"x".repeat(MAX_SSE_FRAME_LENGTH)}`))
      .toThrow(/exceeded limit/u);
  });

  it("fails closed when the transport reaches EOF without a terminal envelope", async () => {
    const onFailure = vi.fn();
    vi.spyOn(globalThis, "fetch").mockResolvedValue(sseResponse([
      { type: "connected", stream_id: "stream-1" },
    ]));

    openPodLogStream("cluster-1", "shop", "checkout", null, {
      onEvent: vi.fn(),
      onFailure,
    });

    await vi.waitFor(() => expect(onFailure).toHaveBeenCalledTimes(1));
    expect(onFailure.mock.calls[0]?.[0]).toMatchObject({ kind: "invalid-payload" });
  });

  it("surfaces the authenticated HTTP boundary before reading a stream", async () => {
    const onFailure = vi.fn();
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(
      JSON.stringify({ detail: "authentication required" }),
      { status: 401, headers: { "content-type": "application/json" } },
    ));

    openPodLogStream("cluster-1", "shop", "checkout", null, {
      onEvent: vi.fn(),
      onFailure,
    });
    await vi.waitFor(() => expect(onFailure).toHaveBeenCalledTimes(1));
    expect(onFailure.mock.calls[0]?.[0]).toMatchObject({ kind: "unauthorized", status: 401 });
  });
});

function sseResponse(events: unknown[]): Response {
  return new Response(events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join(""), {
    status: 200,
    headers: { "content-type": "text/event-stream; charset=utf-8" },
  });
}

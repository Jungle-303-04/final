// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { buildPodTerminalUrl, openPodTerminal } from "./pod-terminal";

type SocketListener = (event: Record<string, unknown>) => void;

class FakeWebSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;
  static readonly instances: FakeWebSocket[] = [];

  readonly listeners = new Map<string, SocketListener[]>();
  readonly sent: string[] = [];
  readonly closes: Array<{ code?: number; reason?: string }> = [];
  readyState = FakeWebSocket.CONNECTING;

  constructor(readonly url: string) {
    FakeWebSocket.instances.push(this);
  }

  addEventListener(type: string, listener: SocketListener): void {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }

  send(data: string): void {
    this.sent.push(data);
  }

  close(code?: number, reason?: string): void {
    this.closes.push({ code, reason });
    this.readyState = FakeWebSocket.CLOSING;
  }

  emit(type: string, event: Record<string, unknown> = {}): void {
    for (const listener of this.listeners.get(type) ?? []) listener(event);
  }

  open(): void {
    this.readyState = FakeWebSocket.OPEN;
    this.emit("open");
  }
}

const TARGET = {
  workspaceId: "workspace-main",
  clusterId: "cluster/a",
  namespace: "sandbox",
  pod: "api-0",
  container: "app container",
};

beforeEach(() => {
  FakeWebSocket.instances.length = 0;
  vi.stubGlobal("WebSocket", FakeWebSocket);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("pod terminal endpoint", () => {
  it("uses a same-origin encoded URL and sends command only after the socket opens", () => {
    expect(buildPodTerminalUrl(TARGET, { protocol: "https:", host: "ops.example" }))
      .toBe(
        "wss://ops.example/api/live/terminal?workspace_id=workspace-main"
        + "&cluster_id=cluster%2Fa&namespace=sandbox&pod=api-0&container=app+container",
      );

    const onEvent = vi.fn();
    const connection = openPodTerminal(TARGET, "  id  ", { onEvent, onFailure: vi.fn() });
    const socket = FakeWebSocket.instances[0]!;
    expect(socket.sent).toEqual([]);

    socket.open();
    expect(socket.sent).toEqual([JSON.stringify({ type: "terminal.start", command: "id" })]);
    socket.emit("message", {
      data: JSON.stringify({ type: "terminal.connected", session_id: "session_1" }),
    });
    connection.sendInput("yes\n");
    expect(socket.sent[socket.sent.length - 1]).toBe(JSON.stringify({
      type: "terminal.input",
      session_id: "session_1",
      data: "yes\n",
    }));

    socket.emit("message", {
      data: JSON.stringify({
        type: "terminal.end",
        session_id: "session_1",
        exit_code: 7,
        reason: "completed",
      }),
    });
    expect(onEvent).toHaveBeenLastCalledWith({
      type: "terminal.end",
      session_id: "session_1",
      exit_code: 7,
      reason: "completed",
    });
    expect(socket.closes).toEqual([{ code: 1000, reason: "Terminal session ended" }]);
  });

  it("fails once for a transport error and rejects malformed server frames", () => {
    const transportFailure = vi.fn();
    openPodTerminal(TARGET, "id", { onEvent: vi.fn(), onFailure: transportFailure });
    const transport = FakeWebSocket.instances[0]!;
    transport.emit("error");
    transport.emit("close", { code: 1006 });
    expect(transportFailure).toHaveBeenCalledOnce();

    const payloadFailure = vi.fn();
    openPodTerminal(TARGET, "id", { onEvent: vi.fn(), onFailure: payloadFailure });
    const malformed = FakeWebSocket.instances[1]!;
    malformed.open();
    malformed.emit("message", { data: JSON.stringify({ type: "terminal.output", data: "raw" }) });
    expect(payloadFailure).toHaveBeenCalledOnce();
    expect(malformed.closes).toEqual([{ code: 1002, reason: "Invalid terminal.v1 payload" }]);
  });
});

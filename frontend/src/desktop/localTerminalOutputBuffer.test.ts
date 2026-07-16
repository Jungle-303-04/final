import { describe, expect, it } from "vitest";

import { LocalTerminalOutputBuffer } from "./localTerminalOutputBuffer";

describe("LocalTerminalOutputBuffer", () => {
  it("coalesces ordered native output into bounded animation-frame batches", () => {
    const buffer = new LocalTerminalOutputBuffer(12, 5);

    expect(buffer.enqueue({ sessionId: "session-1", kind: "output", data: "abc", byteLength: 3 })).toBe(true);
    expect(buffer.enqueue({ sessionId: "session-1", kind: "output", data: "de", byteLength: 2 })).toBe(true);
    expect(buffer.enqueue({ sessionId: "session-1", kind: "output", data: "fghi", byteLength: 4 })).toBe(true);

    expect(buffer.takeFrame()).toEqual({ data: "abcde", byteLength: 5 });
    expect(buffer.takeFrame()).toEqual({ data: "fghi", byteLength: 4 });
    expect(buffer.takeFrame()).toBeNull();
  });

  it("never admits more native output than its acknowledged output window", () => {
    const buffer = new LocalTerminalOutputBuffer(4, 4);

    expect(buffer.enqueue({ sessionId: "session-1", kind: "output", data: "abcd", byteLength: 4 })).toBe(true);
    expect(buffer.enqueue({ sessionId: "session-1", kind: "output", data: "e", byteLength: 1 })).toBe(false);
    expect(buffer.pendingBytes).toBe(4);
    buffer.clear();
    expect(buffer.pendingBytes).toBe(0);
    expect(buffer.hasPendingOutput).toBe(false);
  });
});

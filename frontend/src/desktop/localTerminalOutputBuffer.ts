import type { DesktopLocalTerminalEvent } from "./desktopBridge";

export type LocalTerminalOutputEvent = Extract<DesktopLocalTerminalEvent, { kind: "output" }>;

export interface LocalTerminalOutputBatch {
  data: string;
  byteLength: number;
}

/**
 * Preserves native terminal byte order while limiting each animation-frame
 * write. The native side withholds additional PTY output until this batch is
 * acknowledged, so the configured window bounds the queued renderer work.
 */
export class LocalTerminalOutputBuffer {
  private queuedBytes = 0;
  private readonly queue: LocalTerminalOutputEvent[] = [];

  constructor(
    private readonly outputWindowBytes: number,
    private readonly outputFrameBytes: number,
  ) {
    if (!isSafePositiveInteger(outputWindowBytes) || !isSafePositiveInteger(outputFrameBytes)) {
      throw new Error("Local terminal output policy must contain positive byte limits.");
    }
    if (outputFrameBytes > outputWindowBytes) {
      throw new Error("Local terminal frame limit cannot exceed its output window.");
    }
  }

  enqueue(event: LocalTerminalOutputEvent): boolean {
    if (event.byteLength > this.outputWindowBytes - this.queuedBytes) return false;
    this.queue.push(event);
    this.queuedBytes += event.byteLength;
    return true;
  }

  takeFrame(): LocalTerminalOutputBatch | null {
    if (this.queue.length === 0) return null;
    const events: LocalTerminalOutputEvent[] = [];
    let byteLength = 0;
    while (this.queue.length > 0) {
      const event = this.queue[0];
      if (events.length > 0 && byteLength + event.byteLength > this.outputFrameBytes) break;
      this.queue.shift();
      events.push(event);
      byteLength += event.byteLength;
      this.queuedBytes -= event.byteLength;
    }
    return {
      data: events.map((event) => event.data).join(""),
      byteLength,
    };
  }

  clear(): void {
    this.queue.length = 0;
    this.queuedBytes = 0;
  }

  get hasPendingOutput(): boolean {
    return this.queue.length > 0;
  }

  get pendingBytes(): number {
    return this.queuedBytes;
  }
}

function isSafePositiveInteger(value: number): boolean {
  return Number.isSafeInteger(value) && value > 0;
}

import { z } from "zod";

import { ApiError, apiStreamResponse, type ApiPath } from "./client";
import { encodePathSegment } from "./url";
import { parseSseFrames } from "../shared/streaming/sse";

const SSE_MEDIA_TYPE = "text/event-stream";
const RECONNECT_DELAY_MS = 500;

export const commandOperationEventSchema = z.strictObject({
  command_id: z.string().min(1),
  sequence: z.number().int().nonnegative(),
  kind: z.enum(["progress", "log", "completed", "failed"]),
  payload: z.record(z.string(), z.unknown()),
  occurred_at: z.string().datetime({ offset: true }),
});

export type CommandOperationEventEndpoint = z.infer<typeof commandOperationEventSchema>;

/** Reconnecting SSE reader for one audited command. It never falls back to status polling. */
export async function* subscribeCommandOperationEvents(
  commandId: string,
  signal?: AbortSignal,
): AsyncIterable<CommandOperationEventEndpoint> {
  const path = commandOperationEventsPath(commandId);
  while (!signal?.aborted) {
    try {
      const completed = yield* consume(path, signal);
      if (completed || signal?.aborted) return;
    } catch (error) {
      if (isAbortError(error)) return;
      if (error instanceof ApiError && error.kind === "invalid-payload") throw error;
    }
    await reconnectDelay(signal);
  }
}

function commandOperationEventsPath(commandId: string): ApiPath {
  const normalized = commandId.trim();
  if (!normalized) throw new TypeError("command ID must not be empty");
  return `/api/commands/${encodePathSegment(normalized)}/events` as ApiPath;
}

async function* consume(
  path: ApiPath,
  signal?: AbortSignal,
): AsyncGenerator<CommandOperationEventEndpoint, boolean> {
  const response = await apiStreamResponse(path, SSE_MEDIA_TYPE, signal);
  if (!response.headers.get("content-type")?.toLowerCase().startsWith(SSE_MEDIA_TYPE)) {
    throw new ApiError("invalid-payload", "Operation stream did not use text/event-stream.");
  }
  if (!response.body) throw new ApiError("invalid-payload", "Operation stream body was unavailable.");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    while (true) {
      const result = await reader.read();
      buffer += decoder.decode(result.value, { stream: !result.done });
      const parsed = parseSseFrames(buffer);
      buffer = parsed.remainder;
      for (const frame of parsed.frames) {
        if (frame.event !== "operation") continue;
        const event = parseOperationEvent(frame.data);
        yield event;
        if (event.kind === "completed" || event.kind === "failed") return true;
      }
      if (result.done) break;
    }
  } finally {
    reader.releaseLock();
  }
  if (buffer.trim()) {
    throw new ApiError("invalid-payload", "Operation stream ended with an unterminated frame.");
  }
  return false;
}

function parseOperationEvent(data: string): CommandOperationEventEndpoint {
  try {
    return commandOperationEventSchema.parse(JSON.parse(data));
  } catch (cause) {
    throw new ApiError("invalid-payload", "Operation event violated its contract.", { cause });
  }
}

async function reconnectDelay(signal?: AbortSignal): Promise<void> {
  await new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, RECONNECT_DELAY_MS);
    signal?.addEventListener("abort", () => {
      clearTimeout(timer);
      resolve();
    }, { once: true });
  });
}

function isAbortError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "name" in error
    && error.name === "AbortError";
}

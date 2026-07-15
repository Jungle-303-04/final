import { ApiError, apiStreamRequest, type ApiPath } from "./client";
import {
  timelineSnapshotRequestSchema,
  timelineStreamFrameSchema,
  timelineStreamRequestSchema,
  type TimelineEndpointStreamFrame,
  type TimelineSnapshotRequest,
  type TimelineStreamRequest,
} from "./timeline-schemas";
import { parseSseFrames } from "../shared/streaming/sse";

export const TIMELINE_SNAPSHOTS_PATH: ApiPath = "/api/timeline/snapshots";
export const TIMELINE_STREAM_PATH: ApiPath = "/api/timeline/stream";

const NDJSON_MEDIA_TYPE = "application/x-ndjson";
const SSE_MEDIA_TYPE = "text/event-stream";

export interface TimelineSnapshotEndpoint {
  readonly snapshot: Extract<TimelineEndpointStreamFrame, { kind: "snapshot" }>;
  readonly end: Extract<TimelineEndpointStreamFrame, { kind: "end" }>;
}

export type TimelineLiveEndpointStreamFrame = Extract<
  TimelineEndpointStreamFrame,
  { kind: "event" | "coverage" | "resync_required" | "error" }
>;

export type TimelineStreamLifecycle =
  | { state: "connecting" }
  | { state: "connected" }
  | { state: "reconnecting"; attempt: number; retryAfterMs: number | null }
  | { state: "closed" }
  | { state: "failed"; failure: "forbidden" | "invalid" | "unavailable" };

export interface TimelineStreamSubscription {
  readonly onLifecycle?: (lifecycle: TimelineStreamLifecycle) => void;
  readonly signal?: AbortSignal;
}

/**
 * Reads one immutable Timeline snapshot.  NDJSON is deliberately decoded as
 * its frame protocol, rather than being coerced into a UI-shaped JSON list.
 */
export async function getTimelineSnapshot(
  input: TimelineSnapshotRequest,
  signal?: AbortSignal,
): Promise<TimelineSnapshotEndpoint> {
  const request = timelineSnapshotRequestSchema.parse(input);
  const response = await apiStreamRequest(TIMELINE_SNAPSHOTS_PATH, NDJSON_MEDIA_TYPE, {
    body: JSON.stringify(request),
    headers: { "content-type": "application/json" },
    method: "POST",
    signal,
  });
  assertContentType(response, NDJSON_MEDIA_TYPE, "Timeline snapshot");
  const frames = await readNdjsonFrames(response);
  if (frames.length !== 2 || frames[0]?.kind !== "snapshot" || frames[1]?.kind !== "end") {
    throw invalidPayload("Timeline snapshot did not contain exactly snapshot and end frames.");
  }
  if (frames[0].cursor.token !== frames[1].cursor.token) {
    throw invalidPayload("Timeline snapshot terminal cursor did not match the snapshot cursor.");
  }
  return { snapshot: frames[0], end: frames[1] };
}

/**
 * POST-based Fetch SSE because EventSource cannot submit the bounded Timeline
 * query body. This is intentionally one connection: the feature adapter owns
 * reconnect timing from the server-negotiated snapshot policy, while this
 * transport only preserves the exact opaque cursor supplied by that adapter.
 */
export async function* subscribeTimelineEvents(
  input: TimelineStreamRequest,
  subscription: TimelineStreamSubscription = {},
): AsyncIterable<TimelineLiveEndpointStreamFrame> {
  const request = timelineStreamRequestSchema.parse(input);
  const { onLifecycle, signal } = subscription;
  onLifecycle?.({ state: "connecting" });
  try {
    const result = yield* readSseConnection(request, request.after.token, signal, () => {
      onLifecycle?.({ state: "connected" });
    });
    if (result === "ended") {
      throw new ApiError("network", "Timeline stream closed before a terminal frame.");
    }
    onLifecycle?.({ state: "closed" });
  } catch (error) {
    if (isAbortError(error)) return;
    if (!isTransientStreamError(error)) {
      onLifecycle?.({ state: "failed", failure: timelineFailureFor(error) });
    }
    throw error;
  }
}

async function* readSseConnection(
  request: TimelineStreamRequest,
  cursor: string,
  signal: AbortSignal | undefined,
  onConnected: () => void,
): AsyncGenerator<TimelineLiveEndpointStreamFrame, "ended" | "terminal"> {
  const response = await apiStreamRequest(TIMELINE_STREAM_PATH, SSE_MEDIA_TYPE, {
    body: JSON.stringify({ ...request, after: { token: cursor } }),
    headers: {
      "content-type": "application/json",
      "last-event-id": cursor,
    },
    method: "POST",
    signal,
  });
  assertContentType(response, SSE_MEDIA_TYPE, "Timeline stream");
  if (!response.body) throw invalidPayload("Timeline stream body was unavailable.");
  onConnected();

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let remainder = "";
  try {
    while (true) {
      const result = await reader.read();
      remainder += decoder.decode(result.value, { stream: !result.done });
      const parsed = parseSseFrames(remainder);
      remainder = parsed.remainder;
      for (const frame of parsed.frames) {
        const timelineFrame = parseSseTimelineFrame(frame.event, frame.id, frame.data);
        yield timelineFrame;
        if (timelineFrame.kind === "resync_required" || timelineFrame.kind === "error") {
          return "terminal";
        }
      }
      if (result.done) break;
    }
  } finally {
    reader.releaseLock();
  }
  if (remainder.trim()) throw invalidPayload("Timeline stream ended with an unterminated frame.");
  return "ended";
}

async function readNdjsonFrames(response: Response): Promise<TimelineEndpointStreamFrame[]> {
  if (!response.body) throw invalidPayload("Timeline snapshot body was unavailable.");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const frames: TimelineEndpointStreamFrame[] = [];
  let remainder = "";
  try {
    while (true) {
      const result = await reader.read();
      remainder += decoder.decode(result.value, { stream: !result.done });
      const lines = remainder.split("\n");
      remainder = lines.pop() ?? "";
      for (const line of lines) {
        if (line === "") throw invalidPayload("Timeline snapshot contained a blank NDJSON frame.");
        frames.push(parseTimelineFrame(line.endsWith("\r") ? line.slice(0, -1) : line));
      }
      if (result.done) break;
    }
  } finally {
    reader.releaseLock();
  }
  if (remainder !== "") {
    throw invalidPayload("Timeline snapshot ended without an NDJSON line terminator.");
  }
  return frames;
}

function parseSseTimelineFrame(
  eventName: string | null,
  frameId: string | null,
  data: string,
): TimelineLiveEndpointStreamFrame {
  const frame = parseTimelineFrame(data);
  if (eventName !== frame.kind) {
    throw invalidPayload("Timeline SSE event name did not match its contract frame.");
  }
  if (frameId !== frame.cursor.token) {
    throw invalidPayload("Timeline SSE ID did not match its opaque cursor.");
  }
  if (frame.kind === "snapshot" || frame.kind === "end") {
    throw invalidPayload("Timeline SSE emitted a frame that is invalid for a live subscription.");
  }
  return frame;
}

function parseTimelineFrame(data: string): TimelineEndpointStreamFrame {
  let decoded: unknown;
  try {
    decoded = JSON.parse(data);
  } catch (cause) {
    throw invalidPayload("Timeline frame was not valid JSON.", cause);
  }
  const result = timelineStreamFrameSchema.safeParse(decoded);
  if (!result.success) {
    throw invalidPayload("Timeline frame violated its contract.", result.error);
  }
  return result.data;
}

function assertContentType(response: Response, mediaType: string, label: string): void {
  if (!response.headers.get("content-type")?.toLowerCase().startsWith(mediaType)) {
    throw invalidPayload(`${label} did not use ${mediaType}.`);
  }
}

function invalidPayload(message: string, cause?: unknown): ApiError {
  return new ApiError("invalid-payload", message, { cause });
}

function isTransientStreamError(error: unknown): boolean {
  if (!(error instanceof ApiError)) return true;
  return ![
    "unauthorized",
    "forbidden",
    "not-found",
    "invalid-request",
    "invalid-payload",
  ].includes(error.kind);
}

function timelineFailureFor(error: unknown): "forbidden" | "invalid" | "unavailable" {
  if (!(error instanceof ApiError)) return "unavailable";
  if (error.kind === "unauthorized" || error.kind === "forbidden") return "forbidden";
  if (["not-found", "invalid-request", "invalid-payload"].includes(error.kind)) return "invalid";
  return "unavailable";
}

function isAbortError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "name" in error
    && error.name === "AbortError";
}

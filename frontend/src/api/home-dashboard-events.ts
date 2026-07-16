import { ApiError, apiStreamRequest, type ApiPath } from "./client";
import {
  homeDashboardEventFrameSchema,
  type HomeDashboardEventFrameEndpoint,
} from "./home-dashboard-events-schemas";
import { encodePathSegment } from "./url";
import { parseSseFrames } from "../shared/streaming/sse";

const SSE_MEDIA_TYPE = "text/event-stream";

export interface HomeDashboardEventSubscriptionEndpoint {
  after?: string;
  signal?: AbortSignal;
}

export async function* subscribeHomeDashboardEvents(
  clusterId: string,
  options: HomeDashboardEventSubscriptionEndpoint = {},
): AsyncIterable<HomeDashboardEventFrameEndpoint> {
  const path = `/api/clusters/${encodePathSegment(clusterId)}/home/events` as ApiPath;
  const headers = options.after === undefined ? undefined : { "last-event-id": options.after };
  const response = await apiStreamRequest(path, SSE_MEDIA_TYPE, {
    headers,
    signal: options.signal,
  });
  if (!response.headers.get("content-type")?.toLowerCase().startsWith(SSE_MEDIA_TYPE)) {
    throw invalidPayload("Home dashboard event stream did not use text/event-stream.");
  }
  if (!response.body) throw invalidPayload("Home dashboard event stream body was unavailable.");

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let remainder = "";
  try {
    while (true) {
      const result = await reader.read();
      remainder += decoder.decode(result.value, { stream: !result.done });
      const parsed = parseSseFrames(remainder);
      remainder = parsed.remainder;
      for (const raw of parsed.frames) {
        let decoded: unknown;
        try {
          decoded = JSON.parse(raw.data);
        } catch (cause) {
          throw invalidPayload("Home dashboard event frame was not valid JSON.", cause);
        }
        const frame = homeDashboardEventFrameSchema.safeParse(decoded);
        if (!frame.success) {
          throw invalidPayload("Home dashboard event frame violated its contract.", frame.error);
        }
        if (raw.id !== frame.data.cursor || raw.event !== frame.data.kind) {
          throw invalidPayload("Home dashboard SSE metadata did not match its data frame.");
        }
        yield frame.data;
      }
      if (result.done) break;
    }
  } finally {
    reader.releaseLock();
  }
  if (remainder.trim()) {
    throw invalidPayload("Home dashboard event stream ended with an unterminated frame.");
  }
}

function invalidPayload(message: string, cause?: unknown): ApiError {
  return new ApiError("invalid-payload", message, { cause });
}

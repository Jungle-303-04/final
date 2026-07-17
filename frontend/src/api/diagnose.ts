import {
  diagnoseCapabilitiesSchema,
  diagnoseConsentGrantSchema,
  diagnoseEventSchema,
  diagnoseHistoryClearSchema,
  diagnoseLaunchResultSchema,
  diagnoseRunListSchema,
  diagnoseRunSchema,
  type DiagnoseEventEndpoint,
} from "./diagnose-schemas";
import {
  ApiError,
  apiRequest,
  apiStreamResponse,
  type ApiPath,
} from "./client";
import { encodePathSegment } from "./url";
import { parseSseFrames } from "../shared/streaming/sse";

const SSE_MEDIA_TYPE = "text/event-stream";
const RECONNECT_BASE_DELAY_MS = 250;
const RECONNECT_MAX_DELAY_MS = 5_000;

export function getDiagnoseCapabilities(signal?: AbortSignal) {
  return apiRequest(
    "/api/diagnose/capabilities",
    diagnoseCapabilitiesSchema,
    { signal },
  );
}

export function grantDiagnoseConsent(payload: unknown, signal?: AbortSignal) {
  return apiRequest(
    "/api/diagnose/consents",
    diagnoseConsentGrantSchema,
    {
      body: JSON.stringify(payload),
      headers: { "content-type": "application/json" },
      method: "POST",
      signal,
    },
  );
}

export function createDiagnoseRun(payload: unknown, signal?: AbortSignal) {
  return apiRequest(
    "/api/diagnose/runs",
    diagnoseLaunchResultSchema,
    {
      body: JSON.stringify(payload),
      headers: { "content-type": "application/json" },
      method: "POST",
      signal,
    },
  );
}

export function listDiagnoseRuns(limit = 20, signal?: AbortSignal) {
  const bounded = Math.max(1, Math.min(100, Math.trunc(limit)));
  return apiRequest(
    `/api/diagnose/runs?limit=${bounded}` as ApiPath,
    diagnoseRunListSchema,
    { signal },
  );
}

export function addDiagnoseTurn(
  runId: string,
  question: string,
  signal?: AbortSignal,
) {
  return apiRequest(
    diagnoseRunPath(runId, "turns"),
    diagnoseRunSchema,
    {
      body: JSON.stringify({ question }),
      headers: { "content-type": "application/json" },
      method: "POST",
      signal,
    },
  );
}

export function stopDiagnoseRun(runId: string, signal?: AbortSignal) {
  return apiRequest(
    diagnoseRunPath(runId, "stop"),
    diagnoseRunSchema,
    { method: "POST", signal },
  );
}

export function clearDiagnoseHistory(signal?: AbortSignal) {
  return apiRequest(
    "/api/diagnose/history",
    diagnoseHistoryClearSchema,
    { method: "DELETE", signal },
  );
}

export async function* subscribeDiagnoseEvents(
  runId: string,
  options: { afterSequence?: number; signal?: AbortSignal } = {},
): AsyncIterable<DiagnoseEventEndpoint> {
  const path = diagnoseRunPath(runId, "events");
  let cursor = normalizeCursor(options.afterSequence);
  let attempt = 0;
  while (!options.signal?.aborted) {
    try {
      const result = yield* consume(path, runId.trim(), cursor, options.signal);
      cursor = result.cursor;
      if (result.completed || options.signal?.aborted) return;
      attempt = result.progressed ? 0 : attempt + 1;
    } catch (error) {
      if (isAbortError(error)) return;
      if (!isTransient(error)) throw error;
      attempt += 1;
    }
    await reconnectDelay(attempt, options.signal);
  }
}

async function* consume(
  path: ApiPath,
  runId: string,
  startingCursor: number,
  signal?: AbortSignal,
): AsyncGenerator<
  DiagnoseEventEndpoint,
  { completed: boolean; cursor: number; progressed: boolean }
> {
  const response = await apiStreamResponse(
    path,
    SSE_MEDIA_TYPE,
    signal,
    startingCursor > 0 ? { "last-event-id": String(startingCursor) } : undefined,
  );
  if (!response.headers.get("content-type")?.toLowerCase().startsWith(SSE_MEDIA_TYPE)) {
    throw new ApiError("invalid-payload", "Diagnose stream did not use text/event-stream.");
  }
  if (!response.body) {
    throw new ApiError("invalid-payload", "Diagnose stream body was unavailable.");
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let cursor = startingCursor;
  let progressed = false;
  try {
    while (true) {
      const result = await reader.read();
      buffer += decoder.decode(result.value, { stream: !result.done });
      const parsed = parseSseFrames(buffer);
      buffer = parsed.remainder;
      for (const frame of parsed.frames) {
        if (frame.event === "resync_required") {
          throw new ApiError(
            "invalid-payload",
            "Diagnose transcript retention requires a full resync.",
          );
        }
        if (frame.event !== "diagnose") continue;
        const event = parseEvent(frame.data);
        if (event.run_id !== runId || event.sequence <= cursor) continue;
        if (event.sequence !== cursor + 1) {
          throw new ApiError("invalid-payload", "Diagnose event sequence was not contiguous.");
        }
        if (frame.id !== null && Number(frame.id) !== event.sequence) {
          throw new ApiError("invalid-payload", "Diagnose SSE ID did not match its sequence.");
        }
        cursor = event.sequence;
        progressed = true;
        yield event;
        if (event.kind === "closed" || event.kind === "error") {
          return { completed: true, cursor, progressed };
        }
      }
      if (result.done) break;
    }
  } finally {
    reader.releaseLock();
  }
  if (buffer.trim()) {
    throw new ApiError("invalid-payload", "Diagnose stream ended with an unterminated frame.");
  }
  return { completed: false, cursor, progressed };
}

function parseEvent(data: string) {
  try {
    return diagnoseEventSchema.parse(JSON.parse(data));
  } catch (cause) {
    throw new ApiError("invalid-payload", "Diagnose event violated its contract.", { cause });
  }
}

function diagnoseRunPath(runId: string, suffix: "events" | "stop" | "turns"): ApiPath {
  const normalized = runId.trim();
  if (!normalized) throw new TypeError("Diagnose run ID must not be empty");
  return `/api/diagnose/runs/${encodePathSegment(normalized)}/${suffix}` as ApiPath;
}

function normalizeCursor(cursor: number | undefined): number {
  if (cursor === undefined) return 0;
  if (!Number.isInteger(cursor) || cursor < 0) {
    throw new TypeError("Diagnose cursor must be a non-negative integer");
  }
  return cursor;
}

function isTransient(error: unknown): boolean {
  if (!(error instanceof ApiError)) return true;
  return ![
    "unauthorized",
    "forbidden",
    "not-found",
    "invalid-request",
    "invalid-payload",
  ].includes(error.kind);
}

async function reconnectDelay(attempt: number, signal?: AbortSignal): Promise<void> {
  const cap = Math.min(
    RECONNECT_MAX_DELAY_MS,
    RECONNECT_BASE_DELAY_MS * 2 ** Math.min(attempt, 8),
  );
  const delay = Math.floor(cap * (0.5 + Math.random() * 0.5));
  await new Promise<void>((resolve) => {
    const timer = setTimeout(done, delay);
    function done() {
      clearTimeout(timer);
      signal?.removeEventListener("abort", done);
      resolve();
    }
    signal?.addEventListener("abort", done, { once: true });
  });
}

function isAbortError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "name" in error
    && error.name === "AbortError";
}

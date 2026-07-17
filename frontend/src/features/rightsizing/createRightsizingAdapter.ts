import type { RightsizingScanEndpoint } from "./rightsizingEndpointContract";
import { toRightsizingScan } from "./rightsizingAdapter";
import {
  RightsizingPortFailure,
  type RightsizingFailureCode,
  type RightsizingPort,
  type RightsizingScanRequest,
} from "./rightsizingContract";

export interface RightsizingEndpointDependencies {
  getRightsizingScan(
    query: RightsizingScanRequest,
    signal?: AbortSignal,
  ): Promise<RightsizingScanEndpoint>;
}

export function createRightsizingAdapter(
  endpoints: RightsizingEndpointDependencies,
): RightsizingPort {
  return {
    getScan: (request, signal) => withPortFailure(async () =>
      toRightsizingScan(await endpoints.getRightsizingScan(request, signal))),
  };
}

async function withPortFailure<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (isAbortError(error) || error instanceof RightsizingPortFailure) throw error;
    throw toPortFailure(error);
  }
}

function toPortFailure(error: unknown): RightsizingPortFailure {
  const kinds: Record<string, RightsizingFailureCode> = {
    unauthorized: "unauthorized",
    forbidden: "forbidden",
    "invalid-request": "invalid-request",
    "invalid-payload": "invalid-response",
    "not-found": "not-found",
    network: "offline",
    "rate-limited": "rate-limited",
  };
  const record = typeof error === "object" && error !== null && !Array.isArray(error)
    ? error as Record<string, unknown>
    : null;
  const kind = typeof record?.kind === "string" ? record.kind : "";
  const retryAfter = typeof record?.retryAfter === "number" ? record.retryAfter : null;
  return new RightsizingPortFailure(kinds[kind] ?? "error", retryAfter);
}

function isAbortError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "name" in error && error.name === "AbortError";
}

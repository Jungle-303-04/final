import type { ResourcesPortFailure } from "../../features/resources/resourcesContract";
import {
  ASYNC_IDLE,
  ASYNC_LOADING,
  asyncResourceFailure,
  asyncResourceSuccess,
  isAbortError,
  startAsyncResource,
  type AsyncResourceState,
} from "../../shared/data/asyncResourceState";
import { ResourcesPortFailure as PortFailure } from "../../features/resources/resourcesContract";

export type ResourcesResourceState<T> = AsyncResourceState<T, ResourcesPortFailure>;

export const RESOURCES_IDLE = ASYNC_IDLE;
export const RESOURCES_LOADING = ASYNC_LOADING;

export function startResourcesResource<T>(
  state: ResourcesResourceState<T>,
): ResourcesResourceState<T> {
  return startAsyncResource(state);
}

export function resourcesSuccess<T>(data: T): ResourcesResourceState<T> {
  return asyncResourceSuccess(data);
}

export function resourcesFailure<T>(
  current: ResourcesResourceState<T>,
  failure: ResourcesPortFailure,
): ResourcesResourceState<T> {
  return asyncResourceFailure(current, failure);
}

export function toResourcesFailure(error: unknown): ResourcesPortFailure {
  if (error instanceof PortFailure) return error;
  const code = readableCode(error);
  if (code === "unauthorized" || code === "forbidden" || code === "offline" ||
    code === "not-found" || code === "invalid-request" || code === "rate-limited" ||
    code === "unavailable" || code === "invalid-response") {
    return new PortFailure(code, readableRetryAfter(error));
  }
  return new PortFailure("error");
}

function readableCode(error: unknown): string | null {
  if (typeof error !== "object" || error === null || !("code" in error)) return null;
  return typeof error.code === "string" ? error.code : null;
}

function readableRetryAfter(error: unknown): number | null {
  if (
    typeof error !== "object" || error === null || !("retryAfterSeconds" in error) ||
    typeof error.retryAfterSeconds !== "number" ||
    !Number.isFinite(error.retryAfterSeconds) || error.retryAfterSeconds < 0
  ) return null;
  return error.retryAfterSeconds;
}

export { isAbortError };

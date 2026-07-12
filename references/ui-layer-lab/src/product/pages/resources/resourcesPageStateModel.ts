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

export type ResourcesRequestTarget = "choices" | "catalog" | "list" | "detail";
export type ResourcesRetryBlockCode = "forbidden" | "invalid-response" | "rate-limited";

export interface ResourcesRetryBlock {
  code: ResourcesRetryBlockCode;
  retryAt: number | null;
  retryAfterSeconds: number | null;
  target: ResourcesRequestTarget;
}

export type ResourcesRetryBlocks = Partial<
  Record<ResourcesRequestTarget, ResourcesRetryBlock>
>;

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

export function blockForFailure(
  target: ResourcesRequestTarget,
  failure: ResourcesPortFailure,
  now = Date.now(),
): ResourcesRetryBlock | null {
  if (
    failure.code !== "forbidden" &&
    failure.code !== "invalid-response" &&
    failure.code !== "rate-limited"
  ) return null;
  const retryAfterSeconds = failure.code === "rate-limited"
    ? failure.retryAfterSeconds
    : null;
  return {
    code: failure.code,
    retryAfterSeconds,
    retryAt: retryAfterSeconds === null ? null : now + retryAfterSeconds * 1_000,
    target,
  };
}

export function withRetryBlock(
  blocks: ResourcesRetryBlocks,
  block: ResourcesRetryBlock,
): ResourcesRetryBlocks {
  return { ...blocks, [block.target]: block };
}

export function withoutRetryBlock(
  blocks: ResourcesRetryBlocks,
  target: ResourcesRequestTarget,
): ResourcesRetryBlocks {
  if (!(target in blocks)) return blocks;
  const next = { ...blocks };
  delete next[target];
  return next;
}

export function hasRetryBlocks(blocks: ResourcesRetryBlocks): boolean {
  return Object.values(blocks).some(Boolean);
}

export function scheduledRateLimitRetryAt(
  blocks: ResourcesRetryBlocks,
): number | null {
  const values = Object.values(blocks).filter(isRetryBlock);
  if (
    values.length === 0 ||
    values.some(({ code, retryAt }) => code !== "rate-limited" || retryAt === null)
  ) return null;
  return Math.max(...values.map(({ retryAt }) => retryAt!));
}

export function retryWaitSeconds(blocks: ResourcesRetryBlocks, now = Date.now()): number | null {
  const retryAt = scheduledRateLimitRetryAt(blocks);
  return retryAt === null ? null : Math.max(0, Math.ceil((retryAt - now) / 1_000));
}

function isRetryBlock(value: ResourcesRetryBlock | undefined): value is ResourcesRetryBlock {
  return value !== undefined;
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

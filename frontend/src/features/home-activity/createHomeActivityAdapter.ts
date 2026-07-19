import type { ActivityOverviewEndpoint } from "../../api";
import {
  HomeActivityPortFailure,
  type HomeActivityFailureCode,
  type HomeActivityOverview,
  type HomeActivityPort,
} from "./homeActivityContract";

export interface HomeActivityEndpointDependencies {
  getActivityOverview(
    query: { bucketMs: number; fromMs: number; toMs: number },
    signal?: AbortSignal,
  ): Promise<ActivityOverviewEndpoint>;
}

export function createHomeActivityAdapter(
  endpoints: HomeActivityEndpointDependencies,
): HomeActivityPort {
  return {
    async loadOverview(query, signal) {
      return withFailure(async () => toOverview(
        await endpoints.getActivityOverview(query, signal),
      ));
    },
  };
}

function toOverview(value: ActivityOverviewEndpoint): HomeActivityOverview {
  return {
    bucketMs: value.bucket_ms,
    fromMs: value.from_ms,
    toMs: value.to_ms,
    buckets: value.buckets.map((bucket) => ({
      alerts: bucket.alerts,
      critical: bucket.critical,
      deployments: bucket.deployments,
      fromMs: bucket.from_ms,
      toMs: bucket.to_ms,
    })),
  };
}

async function withFailure<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (isAbortError(error) || error instanceof HomeActivityPortFailure) throw error;
    throw new HomeActivityPortFailure(failureCode(error));
  }
}

function failureCode(error: unknown): HomeActivityFailureCode {
  const kind = typeof error === "object" && error !== null && "kind" in error
    ? String(error.kind)
    : "";
  const status = typeof error === "object" && error !== null && "status" in error
    ? error.status
    : null;
  if (status === 503) return "unavailable";
  const byKind: Record<string, HomeActivityFailureCode> = {
    forbidden: "forbidden",
    "invalid-request": "invalid-request",
    "invalid-payload": "invalid-response",
    network: "offline",
    "rate-limited": "rate-limited",
  };
  return byKind[kind] ?? "error";
}

function isAbortError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "name" in error &&
    error.name === "AbortError";
}

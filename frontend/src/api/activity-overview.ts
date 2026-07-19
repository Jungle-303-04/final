import { apiRequest, type ApiPath } from "./client";
import {
  activityOverviewSchema,
  type ActivityOverviewEndpoint,
} from "./activity-overview-schemas";
import { withQuery } from "./url";

export const ACTIVITY_OVERVIEW_PATH: ApiPath = "/api/activity/overview";
const MAX_RANGE_MS = 30 * 24 * 60 * 60 * 1_000;
const MAX_BUCKETS = 366;

export interface ActivityOverviewQuery {
  applications?: readonly string[];
  bucketMs: number;
  clusterIds?: readonly string[];
  fromMs: number;
  namespaces?: readonly string[];
  toMs: number;
}

export function getActivityOverview(
  query: ActivityOverviewQuery,
  signal?: AbortSignal,
): Promise<ActivityOverviewEndpoint> {
  assertActivityWindow(query);
  return apiRequest(withQuery(ACTIVITY_OVERVIEW_PATH, [
    ["from", query.fromMs],
    ["to", query.toMs],
    ["bucket", query.bucketMs],
    ...(query.clusterIds ?? []).map((value) => ["clusters", value] as const),
    ...(query.namespaces ?? []).map((value) => ["namespaces", value] as const),
    ...(query.applications ?? []).map((value) => ["applications", value] as const),
  ]), activityOverviewSchema, { signal });
}

function assertActivityWindow(query: ActivityOverviewQuery) {
  const { bucketMs, fromMs, toMs } = query;
  if (![bucketMs, fromMs, toMs].every(Number.isSafeInteger)) {
    throw new TypeError("activity overview bounds must be safe integers");
  }
  const width = toMs - fromMs;
  if (
    fromMs < 0 ||
    width <= 0 ||
    width > MAX_RANGE_MS ||
    bucketMs < 60_000 ||
    bucketMs > width ||
    Math.ceil(width / bucketMs) > MAX_BUCKETS
  ) {
    throw new RangeError("activity overview requires a supported bounded window");
  }
}

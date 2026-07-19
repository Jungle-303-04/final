import type { CostOverview, CostTimeRange } from "../../features/cost/costContract";
import type { UnifiedFilterState } from "../../features/filters/filterContract";
import type { HomeBoardPeriod } from "../../features/home-activity/homeActivityContract";
import {
  timelineActivityKeysFromActivities,
  TimelineFailure,
  type TimelineCapabilities,
  type TimelineGrouping,
  type TimelineQuery,
  type TimelineSort,
  type TimelineViewMode,
} from "../../features/timeline/timelineContract";
import type {
  HomeBoardScope,
  HomeCostProjection,
} from "./useHomeBoardData";

export function criticalResourceFilterState(
  state: UnifiedFilterState,
  clusterIds: readonly string[],
  health: readonly ("critical" | "warning")[] = ["critical", "warning"],
): UnifiedFilterState {
  return {
    ...state,
    common: { ...state.common, clusters: clusterIds },
    resources: {
      ...state.resources,
      health,
      includeDeleted: false,
      query: "",
    },
  };
}

export function costRangeForPeriod(period: HomeBoardPeriod): CostTimeRange {
  if (period === "today") return "24h";
  return "7d";
}

export function projectHomeCost(
  overview: CostOverview,
  fromMs: number,
  toMs: number,
): HomeCostProjection {
  if (
    overview.observation.availability === "unavailable"
    || overview.summary.availability === "unavailable"
  ) {
    throw new Error("cost observation unavailable");
  }
  const periodTotalMicros = overview.summary.monthlyProjection;
  if (!Number.isSafeInteger(periodTotalMicros) || periodTotalMicros < 0) {
    throw new Error("cost total unavailable");
  }
  if (
    overview.trend.availability === "unavailable"
    || overview.trend.series.length === 0
    || overview.trend.currency !== overview.observation.currency
  ) {
    return {
      changePercent: null,
      currency: overview.observation.currency,
      periodTotalMicros,
      values: [],
    };
  }
  const fromSeconds = fromMs / 1_000;
  const toSeconds = toMs / 1_000;
  const rates = new Map<number, number>();
  for (const series of overview.trend.series) {
    for (const point of series.points) {
      if (
        point.timestamp < fromSeconds
        || point.timestamp > toSeconds
        || !Number.isSafeInteger(point.rateMicros)
        || point.rateMicros < 0
      ) continue;
      rates.set(point.timestamp, (rates.get(point.timestamp) ?? 0) + point.rateMicros);
    }
  }
  const points = [...rates.entries()].sort(([left], [right]) => left - right);
  if (points.length === 0) {
    return {
      changePercent: null,
      currency: overview.trend.currency,
      periodTotalMicros,
      values: [],
    };
  }
  const first = points[0]![1];
  const last = points[points.length - 1]![1];
  return {
    changePercent: points.length < 2 || first === 0
      ? null
      : ((last - first) / first) * 100,
    currency: overview.trend.currency,
    periodTotalMicros,
    values: points.map(([, rateMicros]) => rateMicros / 1_000_000),
  };
}

export function homeTimelineQuery(
  capabilities: TimelineCapabilities,
  scope: HomeBoardScope,
  widthMs: number,
): TimelineQuery {
  if (
    !Number.isSafeInteger(widthMs)
    || widthMs <= 0
    || widthMs > capabilities.maxRetainedRangeMs
    || widthMs > capabilities.queryBounds.maxWindowMs
  ) {
    throw new TimelineFailure("invalid-request");
  }
  const controls = capabilities.controlSurface;
  const view = firstTimelineValue(
    controls.views.map((option) => option.id),
    ["list", "swimlane"] as const,
    "list",
  );
  const grouping = firstTimelineValue(
    controls.groupings.map((option) => option.id),
    ["app", "flat", "owner"] as const,
  );
  const sort = firstTimelineValue(
    controls.sorts.map((option) => option.id),
    ["importance", "name", "recent"] as const,
    "recent",
  );
  const activity = controls.activity[0];
  if (!activity || !controls.defaultLensZoomRung) {
    throw new TimelineFailure("invalid-response");
  }
  return {
    scopes: scope.clusters,
    mode: { kind: "live", widthMs },
    control: {
      view: view as TimelineViewMode,
      rangeId: controls.timeRanges.find((range) => range.durationMs === widthMs)?.id
        ?? controls.customTimeRangeId,
      lensZoomRung: controls.defaultLensZoomRung,
    },
    filters: {
      activity: timelineActivityKeysFromActivities(activity.activity),
      kinds: [],
      showDeleted: controls.deleted.default,
      pinnedOnly: false,
      search: "",
      grouping: grouping as TimelineGrouping,
      sort: sort as TimelineSort,
      selectedEventKey: null,
    },
  };
}

function firstTimelineValue<T extends string>(
  advertised: readonly string[],
  allowed: readonly T[],
  preferred?: T,
): T {
  if (preferred && advertised.includes(preferred)) return preferred;
  const value = advertised.find((candidate): candidate is T => allowed.includes(candidate as T));
  if (!value) throw new TimelineFailure("invalid-response");
  return value;
}

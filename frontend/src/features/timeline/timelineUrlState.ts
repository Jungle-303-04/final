import type {
  TimelineActivityKey,
  TimelineGrouping,
  TimelineMode,
  TimelineSort,
  TimelineViewMode,
} from "./timelineContract";

export const DAY_MILLISECONDS = 24 * 60 * 60 * 1000;
export const DEFAULT_LIVE_WINDOW_MILLISECONDS = 60 * 60 * 1000;

const DEFAULT_VIEW_MODE: TimelineViewMode = "swimlane";
const DEFAULT_GROUPING: TimelineGrouping = "app";
const DEFAULT_SORT: TimelineSort = "importance";
const ACTIVITY_KEYS: readonly TimelineActivityKey[] = [
  "changes",
  "k8s_events",
  "warnings",
  "unhealthy",
];
const GROUPINGS: readonly TimelineGrouping[] = ["app", "owner", "flat"];
const SORTS: readonly TimelineSort[] = ["importance", "recent", "name"];
const HIGH_FREQUENCY_KEYS = new Set(["q", "from", "to", "window", "event"]);
const MANAGED_KEYS = [
  "view",
  "from",
  "to",
  "window",
  "activity",
  "kinds",
  "deleted",
  "pinnedOnly",
  "q",
  "grouping",
  "sort",
  "event",
  "filter",
] as const;

export interface TimelineUrlOptions {
  isRetained: boolean;
  maxRetainedRangeMs: number;
  requiresNamespaceFilter: boolean;
}

export interface TimelineUrlState {
  viewMode: TimelineViewMode;
  mode: TimelineMode;
  showDeleted: boolean;
  pinnedOnly: boolean;
  search: string;
  activityFilter: readonly TimelineActivityKey[];
  kindFilter: readonly string[];
  grouping: TimelineGrouping;
  sort: TimelineSort;
  selectedEventKey: string | null;
}

export const DEFAULT_TIMELINE_URL_STATE: TimelineUrlState = {
  viewMode: DEFAULT_VIEW_MODE,
  mode: { kind: "live", widthMs: DEFAULT_LIVE_WINDOW_MILLISECONDS },
  showDeleted: true,
  pinnedOnly: false,
  search: "",
  activityFilter: [],
  kindFilter: [],
  grouping: DEFAULT_GROUPING,
  sort: DEFAULT_SORT,
  selectedEventKey: null,
};

export function parseTimelineUrlState(
  searchParams: URLSearchParams,
  options: TimelineUrlOptions,
): TimelineUrlState {
  const requestedView = parseEnum(searchParams.get("view"), ["list", "swimlane"] as const);
  return {
    viewMode: options.requiresNamespaceFilter ? "list" : requestedView ?? DEFAULT_VIEW_MODE,
    mode: parseTimelineMode(searchParams, options),
    showDeleted: searchParams.get("deleted") !== "0",
    pinnedOnly: searchParams.get("pinnedOnly") === "1",
    search: searchParams.get("q") ?? "",
    activityFilter: parseActivity(searchParams.get("activity")),
    kindFilter: parseCsv(searchParams.get("kinds")),
    grouping: parseEnum(searchParams.get("grouping"), GROUPINGS) ?? DEFAULT_GROUPING,
    sort: parseEnum(searchParams.get("sort"), SORTS) ?? DEFAULT_SORT,
    selectedEventKey: nonEmpty(searchParams.get("event")),
  };
}

export function writeTimelineSearchParams(
  base: URLSearchParams,
  state: TimelineUrlState,
  options: TimelineUrlOptions,
): URLSearchParams {
  const params = new URLSearchParams(base);
  for (const key of MANAGED_KEYS) params.delete(key);

  const viewMode = options.requiresNamespaceFilter ? "list" : state.viewMode;
  if (!options.requiresNamespaceFilter && viewMode !== DEFAULT_VIEW_MODE) {
    params.set("view", viewMode);
  }
  writeTimelineMode(params, state.mode, options);
  if (state.activityFilter.length > 0) params.set("activity", state.activityFilter.join(","));
  if (state.kindFilter.length > 0) params.set("kinds", state.kindFilter.join(","));
  if (!state.showDeleted) params.set("deleted", "0");
  if (state.pinnedOnly) params.set("pinnedOnly", "1");
  if (state.search.length > 0) params.set("q", state.search);
  if (state.grouping !== DEFAULT_GROUPING) params.set("grouping", state.grouping);
  if (state.sort !== DEFAULT_SORT) params.set("sort", state.sort);
  if (state.selectedEventKey !== null) params.set("event", state.selectedEventKey);
  return params;
}

export function isTimelineHighFrequencyOnlyChange(
  current: URLSearchParams,
  next: URLSearchParams,
): boolean {
  const keys = new Set([...current.keys(), ...next.keys()]);
  const changedKeys = [...keys].filter((key) => current.get(key) !== next.get(key));
  return changedKeys.length > 0 && changedKeys.every((key) => HIGH_FREQUENCY_KEYS.has(key));
}

function parseTimelineMode(searchParams: URLSearchParams, options: TimelineUrlOptions): TimelineMode {
  if (!options.isRetained) return defaultLiveMode();
  const fromMs = parseSafeInteger(searchParams.get("from"));
  const toMs = parseSafeInteger(searchParams.get("to"));
  if (fromMs !== null && toMs !== null && fromMs > 0 && fromMs < toMs) {
    return {
      kind: "frozen",
      fromMs: Math.max(fromMs, toMs - options.maxRetainedRangeMs),
      toMs,
    };
  }
  if (searchParams.get("window") === "all") {
    return { kind: "live", widthMs: DEFAULT_LIVE_WINDOW_MILLISECONDS, all: true };
  }
  const widthMs = Number(searchParams.get("window"));
  if (Number.isFinite(widthMs) && widthMs > 0) {
    return { kind: "live", widthMs: Math.round(widthMs) };
  }
  return defaultLiveMode();
}

function writeTimelineMode(
  params: URLSearchParams,
  mode: TimelineMode,
  options: TimelineUrlOptions,
) {
  if (!options.isRetained) return;
  if (mode.kind === "frozen") {
    params.set("from", String(mode.fromMs));
    params.set("to", String(mode.toMs));
    return;
  }
  if (mode.all) {
    params.set("window", "all");
    return;
  }
  if (mode.widthMs !== DEFAULT_LIVE_WINDOW_MILLISECONDS) {
    params.set("window", String(mode.widthMs));
  }
}

function parseActivity(value: string | null): readonly TimelineActivityKey[] {
  return parseCsv(value).filter((item): item is TimelineActivityKey =>
    ACTIVITY_KEYS.includes(item as TimelineActivityKey),
  );
}

function parseCsv(value: string | null): readonly string[] {
  if (value === null) return [];
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}

function parseEnum<T extends string>(value: string | null, values: readonly T[]): T | null {
  return value !== null && values.includes(value as T) ? value as T : null;
}

function parseSafeInteger(value: string | null): number | null {
  if (value === null) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

function defaultLiveMode(): TimelineMode {
  return { kind: "live", widthMs: DEFAULT_LIVE_WINDOW_MILLISECONDS };
}

function nonEmpty(value: string | null): string | null {
  return value === null || value.length === 0 ? null : value;
}

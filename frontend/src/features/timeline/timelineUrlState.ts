import {
  isTimelineActivityKey,
  type TimelineActivityKey,
  type TimelineGrouping,
  type TimelineMode,
  type TimelineSort,
  type TimelineViewMode,
} from "./timelineContract";

export const DAY_MILLISECONDS = 24 * 60 * 60 * 1000;
export const DEFAULT_LIVE_WINDOW_MILLISECONDS = 60 * 60 * 1000;

const DEFAULT_VIEW_MODE: TimelineViewMode = "swimlane";
const DEFAULT_GROUPING: TimelineGrouping = "app";
const DEFAULT_SORT: TimelineSort = "importance";
const GROUPINGS: readonly TimelineGrouping[] = ["app", "owner", "flat"];
const SORTS: readonly TimelineSort[] = ["importance", "recent", "name"];
const HIGH_FREQUENCY_KEYS = new Set(["q", "from", "to", "window", "event", "zoom"]);
const MANAGED_KEYS = [
  "view",
  "from",
  "to",
  "window",
  "range",
  "zoom",
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
  defaultViewMode?: TimelineViewMode;
  defaultShowDeleted?: boolean;
  defaultActivityFilter?: readonly TimelineActivityKey[];
  defaultGrouping?: TimelineGrouping;
  defaultSort?: TimelineSort;
  defaultLensZoomRung?: string;
  /** Supplied by the server's default time-range descriptor. */
  defaultLiveWindowMs?: number;
  defaultTimeRangeId?: string;
}

export interface TimelineUrlState {
  viewMode: TimelineViewMode;
  mode: TimelineMode;
  showDeleted: boolean;
  search: string;
  activityFilter: readonly TimelineActivityKey[];
  kindFilter: readonly string[];
  grouping: TimelineGrouping;
  sort: TimelineSort;
  selectedEventKey: string | null;
  /** Null is reconciled through the server descriptor after capability bootstrap. */
  lensZoomRung: string | null;
  /** The server range ID is retained independently from its duration. */
  rangeId: string | null;
}

export const DEFAULT_TIMELINE_URL_STATE: TimelineUrlState = {
  viewMode: DEFAULT_VIEW_MODE,
  mode: { kind: "live", widthMs: DEFAULT_LIVE_WINDOW_MILLISECONDS },
  showDeleted: true,
  search: "",
  activityFilter: [],
  kindFilter: [],
  grouping: DEFAULT_GROUPING,
  sort: DEFAULT_SORT,
  selectedEventKey: null,
  lensZoomRung: null,
  rangeId: null,
};

export function parseTimelineUrlState(
  searchParams: URLSearchParams,
  options: TimelineUrlOptions,
): TimelineUrlState {
  const requestedView = parseEnum(searchParams.get("view"), ["list", "swimlane"] as const);
  return {
    viewMode: options.requiresNamespaceFilter ? "list" : requestedView ?? options.defaultViewMode ?? DEFAULT_VIEW_MODE,
    mode: parseTimelineMode(searchParams, options),
    showDeleted: searchParams.has("deleted")
      ? searchParams.get("deleted") !== "0"
      : options.defaultShowDeleted ?? true,
    search: searchParams.get("q") ?? "",
    activityFilter: searchParams.has("activity")
      ? parseActivity(searchParams.get("activity"))
      : options.defaultActivityFilter ?? [],
    kindFilter: parseCsv(searchParams.get("kinds")),
    grouping: parseEnum(searchParams.get("grouping"), GROUPINGS) ?? options.defaultGrouping ?? DEFAULT_GROUPING,
    sort: parseEnum(searchParams.get("sort"), SORTS) ?? options.defaultSort ?? DEFAULT_SORT,
    selectedEventKey: nonEmpty(searchParams.get("event")),
    lensZoomRung: nonEmpty(searchParams.get("zoom")) ?? options.defaultLensZoomRung ?? null,
    rangeId: nonEmpty(searchParams.get("range")) ?? options.defaultTimeRangeId ?? null,
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
  if (!options.requiresNamespaceFilter && viewMode !== (options.defaultViewMode ?? DEFAULT_VIEW_MODE)) {
    params.set("view", viewMode);
  }
  writeTimelineMode(params, state.mode, options);
  if (!sameStrings(state.activityFilter, options.defaultActivityFilter ?? [])) {
    params.set("activity", state.activityFilter.join(","));
  }
  if (state.kindFilter.length > 0) params.set("kinds", state.kindFilter.join(","));
  if (state.showDeleted !== (options.defaultShowDeleted ?? true)) {
    params.set("deleted", state.showDeleted ? "1" : "0");
  }
  if (state.search.length > 0) params.set("q", state.search);
  if (state.grouping !== (options.defaultGrouping ?? DEFAULT_GROUPING)) params.set("grouping", state.grouping);
  if (state.sort !== (options.defaultSort ?? DEFAULT_SORT)) params.set("sort", state.sort);
  if (state.selectedEventKey !== null) params.set("event", state.selectedEventKey);
  if (state.lensZoomRung !== null) params.set("zoom", state.lensZoomRung);
  if (state.mode.kind === "live" && state.rangeId !== null && state.rangeId !== options.defaultTimeRangeId) {
    params.set("range", state.rangeId);
  }
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
  if (!options.isRetained) return defaultLiveMode(options);
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
    return { kind: "live", widthMs: defaultLiveMode(options).widthMs, all: true };
  }
  const widthMs = Number(searchParams.get("window"));
  if (Number.isFinite(widthMs) && widthMs > 0) {
    return { kind: "live", widthMs: Math.round(widthMs) };
  }
  return defaultLiveMode(options);
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
  if (mode.widthMs !== defaultLiveMode(options).widthMs) {
    params.set("window", String(mode.widthMs));
  }
}

function parseActivity(value: string | null): readonly TimelineActivityKey[] {
  return parseCsv(value).filter((item): item is TimelineActivityKey =>
    isTimelineActivityKey(item),
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

function defaultLiveMode(options: TimelineUrlOptions): Extract<TimelineMode, { kind: "live" }> {
  const candidate = options.defaultLiveWindowMs;
  const widthMs = typeof candidate === "number" && Number.isSafeInteger(candidate) && candidate > 0
    ? candidate
    : DEFAULT_LIVE_WINDOW_MILLISECONDS;
  return {
    kind: "live",
    widthMs,
  };
}

function nonEmpty(value: string | null): string | null {
  return value === null || value.length === 0 ? null : value;
}

function sameStrings(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

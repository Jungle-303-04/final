import {
  timelineActivitiesFromUrlKeys,
  timelineActivityKeysFromActivities,
  type TimelineActivityControlOption,
  type TimelineCapabilities,
  type TimelineControlOption,
  type TimelineGrouping,
  type TimelineOverview,
  type TimelineSort,
  type TimelineViewMode,
} from "./timelineContract";
import type { TimelineUrlState } from "./timelineUrlState";

export interface TimelineActivitySelection {
  option: TimelineActivityControlOption;
  problemsOnly: boolean;
}

/**
 * Resolves a URL projection through the descriptor that was authorized for
 * this scope. The fallback is the descriptor's first entry, never a UI-owned
 * option or label.
 */
export function normalizeTimelineUrlStateForCapabilities(
  state: TimelineUrlState,
  capabilities: TimelineCapabilities,
): TimelineUrlState {
  const controls = capabilities.controlSurface;
  const activity = resolveTimelineActivitySelection(capabilities, state.activityFilter);
  return {
    ...state,
    viewMode: resolveControlId(controls.views, state.viewMode),
    activityFilter: timelineActivityKeysFromActivities(
      activity.problemsOnly ? activity.option.problemsActivity : activity.option.activity,
    ),
    grouping: resolveControlId(controls.groupings, state.grouping),
    sort: resolveControlId(controls.sorts, state.sort),
  };
}

export function resolveTimelineActivitySelection(
  capabilities: TimelineCapabilities,
  activityFilter: TimelineUrlState["activityFilter"],
): TimelineActivitySelection {
  const requested = timelineActivitiesFromUrlKeys(activityFilter);
  const options = capabilities.controlSurface.activity;
  const exactActivity = options.find((option) => sameActivities(option.activity, requested));
  if (exactActivity !== undefined) return { option: exactActivity, problemsOnly: false };
  const exactProblems = options.find((option) => sameActivities(option.problemsActivity, requested));
  if (exactProblems !== undefined) return { option: exactProblems, problemsOnly: true };
  return { option: requiredControl(options), problemsOnly: false };
}

/** Overview facets are the only server-owned kind selection catalog. */
export function validateTimelineKinds(
  kinds: TimelineUrlState["kindFilter"],
  overview: TimelineOverview | null,
): readonly string[] {
  if (overview === null) return [];
  const available = new Set(overview.facets.kinds.map((facet) => facet.kind));
  return [...new Set(kinds)].filter((kind) => available.has(kind));
}

export function isSameTimelineUrlState(left: TimelineUrlState, right: TimelineUrlState): boolean {
  return (
    left.viewMode === right.viewMode &&
    left.showDeleted === right.showDeleted &&
    left.search === right.search &&
    left.grouping === right.grouping &&
    left.sort === right.sort &&
    left.selectedEventKey === right.selectedEventKey &&
    sameActivities(left.activityFilter, right.activityFilter) &&
    sameActivities(left.kindFilter, right.kindFilter) &&
    sameMode(left.mode, right.mode)
  );
}

function resolveControlId<T extends TimelineViewMode | TimelineGrouping | TimelineSort>(
  options: readonly TimelineControlOption[],
  requested: T,
): T {
  const selected = options.find((option) => option.id === requested) ?? requiredControl(options);
  return selected.id as T;
}

function requiredControl<T extends TimelineControlOption>(options: readonly T[]): T {
  const option = options[0];
  if (option === undefined) {
    throw new Error("Timeline control surface contained an empty required option list.");
  }
  return option;
}

function sameActivities(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function sameMode(left: TimelineUrlState["mode"], right: TimelineUrlState["mode"]): boolean {
  if (left.kind !== right.kind) return false;
  if (left.kind === "frozen" && right.kind === "frozen") {
    return left.fromMs === right.fromMs && left.toMs === right.toMs;
  }
  return left.kind === "live" && right.kind === "live" && left.widthMs === right.widthMs && left.all === right.all;
}

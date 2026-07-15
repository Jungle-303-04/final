import { useCallback, useEffect, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import type {
  TimelineActivityKey,
  TimelineGrouping,
  TimelineMode,
  TimelineSort,
  TimelineViewMode,
} from "../timeline/timelineContract";
import {
  isTimelineHighFrequencyOnlyChange,
  parseTimelineUrlState,
  TIMELINE_SELECTION_LENS,
  writeTimelineSearchParams,
  type TimelineLens,
  type TimelineUrlOptions,
  type TimelineUrlState,
} from "./timelineUrlState";

export interface TimelineUrlStateController {
  state: TimelineUrlState;
  setSearch: (search: string) => void;
  setActivityFilter: (activityFilter: readonly TimelineActivityKey[]) => void;
  setKindFilter: (kindFilter: readonly string[]) => void;
  setShowDeleted: (showDeleted: boolean) => void;
  setGrouping: (grouping: TimelineGrouping) => void;
  setSort: (sort: TimelineSort) => void;
  setSelectedEventKey: (sourceKey: string | null) => void;
  setViewMode: (viewMode: TimelineViewMode) => void;
  setLens: (lens: TimelineLens) => void;
  setLensZoomRung: (lensZoomRung: string, lens: TimelineLens) => void;
  setRange: (rangeId: string, mode: TimelineMode) => void;
  setCustomRange: (rangeId: string, mode: Extract<TimelineMode, { kind: "frozen" }>) => void;
  setGoLive: (rangeId: string, mode: Extract<TimelineMode, { kind: "live" }>, lens: TimelineLens) => void;
  replaceState: (state: TimelineUrlState) => void;
}

export function useTimelineUrlState(options: TimelineUrlOptions): TimelineUrlStateController {
  const [searchParams, setSearchParams] = useSearchParams();
  const currentSearch = searchParams.toString();
  const urlOptions = useMemo(() => ({
    isRetained: options.isRetained,
    maxRetainedRangeMs: options.maxRetainedRangeMs,
    requiresNamespaceFilter: options.requiresNamespaceFilter,
    defaultViewMode: options.defaultViewMode,
    defaultShowDeleted: options.defaultShowDeleted,
    defaultActivityFilter: options.defaultActivityFilter,
    defaultGrouping: options.defaultGrouping,
    defaultSort: options.defaultSort,
    defaultLensZoomRung: options.defaultLensZoomRung,
    defaultLiveWindowMs: options.defaultLiveWindowMs,
    defaultTimeRangeId: options.defaultTimeRangeId,
    customTimeRangeId: options.customTimeRangeId,
  }), [
    options.isRetained,
    options.maxRetainedRangeMs,
    options.requiresNamespaceFilter,
    options.defaultViewMode,
    options.defaultShowDeleted,
    options.defaultActivityFilter,
    options.defaultGrouping,
    options.defaultSort,
    options.defaultLensZoomRung,
    options.defaultLiveWindowMs,
    options.defaultTimeRangeId,
    options.customTimeRangeId,
  ]);
  const state = useMemo(
    () => parseTimelineUrlState(new URLSearchParams(currentSearch), urlOptions),
    [currentSearch, urlOptions],
  );
  const normalizedSearch = useMemo(
    () => writeTimelineSearchParams(new URLSearchParams(currentSearch), state, urlOptions).toString(),
    [currentSearch, state, urlOptions],
  );

  useEffect(() => {
    if (normalizedSearch !== currentSearch) setSearchParams(new URLSearchParams(normalizedSearch), { replace: true });
  }, [currentSearch, normalizedSearch, setSearchParams]);

  const update = useCallback((next: TimelineUrlState, replace?: boolean) => {
    const current = new URLSearchParams(currentSearch);
    const params = writeTimelineSearchParams(current, next, urlOptions);
    setSearchParams(params, { replace: replace ?? isTimelineHighFrequencyOnlyChange(current, params) });
  }, [currentSearch, setSearchParams, urlOptions]);

  const setSearch = useCallback((search: string) => update({ ...state, search }), [state, update]);
  const setActivityFilter = useCallback((activityFilter: readonly TimelineActivityKey[]) => update({ ...state, activityFilter }), [state, update]);
  const setKindFilter = useCallback((kindFilter: readonly string[]) => update({ ...state, kindFilter }), [state, update]);
  const setShowDeleted = useCallback((showDeleted: boolean) => update({ ...state, showDeleted }), [state, update]);
  const setGrouping = useCallback((grouping: TimelineGrouping) => update({ ...state, grouping }), [state, update]);
  const setSort = useCallback((sort: TimelineSort) => update({ ...state, sort }), [state, update]);
  const setSelectedEventKey = useCallback((selectedEventKey: string | null) => update({ ...state, selectedEventKey }), [state, update]);
  const setViewMode = useCallback((viewMode: TimelineViewMode) => update({ ...state, viewMode }), [state, update]);
  const setLens = useCallback((lens: TimelineLens) => update({ ...state, lens }, true), [state, update]);
  const setLensZoomRung = useCallback((lensZoomRung: string, lens: TimelineLens) => update({ ...state, lensZoomRung, lens }, true), [state, update]);
  const setRange = useCallback((rangeId: string, mode: TimelineMode) => update({
    ...state,
    rangeId,
    mode,
    lens: TIMELINE_SELECTION_LENS,
  }), [state, update]);
  const setCustomRange = useCallback((rangeId: string, mode: Extract<TimelineMode, { kind: "frozen" }>) => update({
    ...state,
    rangeId,
    mode,
    lens: TIMELINE_SELECTION_LENS,
  }), [state, update]);
  const setGoLive = useCallback((rangeId: string, mode: Extract<TimelineMode, { kind: "live" }>, lens: TimelineLens) => update({
    ...state,
    rangeId,
    mode,
    lens,
  }), [state, update]);
  const replaceState = useCallback((next: TimelineUrlState) => update(next, true), [update]);

  return {
    state,
    setSearch,
    setActivityFilter,
    setKindFilter,
    setShowDeleted,
    setGrouping,
    setSort,
    setSelectedEventKey,
    setViewMode,
    setLens,
    setLensZoomRung,
    setRange,
    setCustomRange,
    setGoLive,
    replaceState,
  };
}

import { useCallback, useEffect, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import type { TimelineViewMode } from "./timelineContract";
import {
  isTimelineHighFrequencyOnlyChange,
  parseTimelineUrlState,
  writeTimelineSearchParams,
  type TimelineUrlOptions,
  type TimelineUrlState,
} from "./timelineUrlState";

export interface TimelineUrlStateController {
  state: TimelineUrlState;
  setSearch: (search: string) => void;
  setSelectedEventKey: (sourceKey: string | null) => void;
  setViewMode: (viewMode: TimelineViewMode) => void;
}

export function useTimelineUrlState(
  options: TimelineUrlOptions,
): TimelineUrlStateController {
  const [searchParams, setSearchParams] = useSearchParams();
  const currentSearch = searchParams.toString();
  const urlOptions = useMemo(() => ({
    isRetained: options.isRetained,
    maxRetainedRangeMs: options.maxRetainedRangeMs,
    requiresNamespaceFilter: options.requiresNamespaceFilter,
  }), [options.isRetained, options.maxRetainedRangeMs, options.requiresNamespaceFilter]);
  const state = useMemo(
    () => parseTimelineUrlState(new URLSearchParams(currentSearch), urlOptions),
    [currentSearch, urlOptions],
  );
  const normalizedSearch = useMemo(
    () => writeTimelineSearchParams(new URLSearchParams(currentSearch), state, urlOptions).toString(),
    [currentSearch, state, urlOptions],
  );

  useEffect(() => {
    if (normalizedSearch !== currentSearch) {
      setSearchParams(new URLSearchParams(normalizedSearch), { replace: true });
    }
  }, [currentSearch, normalizedSearch, setSearchParams]);

  const update = useCallback((next: TimelineUrlState) => {
    const current = new URLSearchParams(currentSearch);
    const params = writeTimelineSearchParams(current, next, urlOptions);
    setSearchParams(params, {
      replace: isTimelineHighFrequencyOnlyChange(current, params),
    });
  }, [currentSearch, setSearchParams, urlOptions]);

  const setSearch = useCallback((search: string) => update({ ...state, search }), [state, update]);
  const setSelectedEventKey = useCallback(
    (selectedEventKey: string | null) => update({ ...state, selectedEventKey }),
    [state, update],
  );
  const setViewMode = useCallback((viewMode: TimelineViewMode) => update({ ...state, viewMode }), [state, update]);

  return { state, setSearch, setSelectedEventKey, setViewMode };
}

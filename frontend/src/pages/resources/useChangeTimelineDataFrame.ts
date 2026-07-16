import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { TimelineRange, UnifiedFilterState } from "../../features/filters/filterContract";
import { parseProductFilterUrl, serializeProductFilterUrl } from "../../features/filters/filterUrl";
import type { ChangeTimelinePort, ChangeTimelineSnapshot } from "../../features/resources/changeTimelineContract";
import { ResourcesPortFailure, type ResourcesPortFailure as ResourcesPortFailureType } from "../../features/resources/resourcesContract";
import { timelineWindow } from "./scrubberMath";
import { useServerRefreshScheduler } from "../../shared/data/useServerRefreshScheduler";
import {
  TimelineFailure,
  type TimelinePort,
} from "../../features/timeline/timelineContract";
import { watchChangeTimelineInvalidations } from "../../features/resources/changeTimelineInvalidation";

export type ChangeTimelineFrame =
  | { phase: "idle"; data: null; failure: null }
  | { phase: "loading"; data: null; failure: null }
  | {
    phase: "ready";
    data: ChangeTimelineSnapshot;
    failure: null;
    refreshFailure: ResourcesPortFailureType | null;
    refreshing: boolean;
    updatedAt: number;
  }
  | { phase: "failed"; data: null; failure: ResourcesPortFailureType };

export function useChangeTimelineDataFrame(input: {
  active: boolean;
  authorityKey: string;
  filterState: UnifiedFilterState;
  onResourceInvalidation?: () => void;
  port: ChangeTimelinePort;
  range: TimelineRange;
  reportUnauthorized: () => void;
  revision: number;
  timelinePort?: Pick<TimelinePort, "readCapabilities" | "readTimeline" | "subscribeTimeline">;
  workspaceId: string | null;
}): ChangeTimelineFrame {
  const {
    active,
    authorityKey,
    filterState,
    onResourceInvalidation,
    port,
    range,
    reportUnauthorized,
    revision,
    timelinePort,
    workspaceId,
  } = input;
  const requestSequence = useRef(0);
  const filterKey = useMemo(() => serializeProductFilterUrl(filterState), [filterState]);
  const requestState = useMemo(() => parseProductFilterUrl(filterKey).state, [filterKey]);
  const windowTrigger = `${filterKey}:${range}:r${revision}`;
  const [liveWindowClock, setLiveWindowClock] = useState(() => ({
    anchorMs: Date.now(),
    refreshRevision: 0,
    trigger: windowTrigger,
  }));
  const windowSynchronized = liveWindowClock.trigger === windowTrigger;
  useEffect(() => {
    if (windowSynchronized) return undefined;
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      setLiveWindowClock((current) => ({
        anchorMs: Date.now(),
        refreshRevision: current.refreshRevision,
        trigger: windowTrigger,
      }));
    });
    return () => {
      active = false;
    };
  }, [windowSynchronized, windowTrigger]);
  const window = useMemo(
    () => timelineWindow(range, liveWindowClock.anchorMs),
    [liveWindowClock.anchorMs, range],
  );
  const scope = active ? `${authorityKey}:${filterKey}:${range}` : null;
  const requestKey = scope === null || !windowSynchronized
    ? null
    : `${scope}:r${revision}:f${liveWindowClock.refreshRevision}`;
  const [record, setRecord] = useState<{ scope: string | null; frame: ChangeTimelineFrame }>({
    scope: null,
    frame: { phase: "idle", data: null, failure: null },
  });
  const updateRecord = useCallback((
    update: (current: typeof record) => typeof record,
  ) => {
    setRecord((current) => {
      const next = update(current);
      return next;
    });
  }, []);
  const refreshController = useServerRefreshScheduler(
    () => setLiveWindowClock((current) => ({
      ...current,
      anchorMs: Date.now(),
      refreshRevision: current.refreshRevision + 1,
    })),
  );
  useEffect(() => {
    const requestId = ++requestSequence.current;
    if (scope === null || requestKey === null) {
      refreshController.backgroundFailure();
      return undefined;
    }
    const controller = new AbortController();
    queueMicrotask(() => {
      if (controller.signal.aborted || requestSequence.current !== requestId) return;
      updateRecord((current) => ({
        scope,
        frame: current.scope === scope && current.frame.phase === "ready"
          ? { ...current.frame, refreshFailure: null, refreshing: true }
          : { phase: "loading", data: null, failure: null },
      }));
    });
    void port.loadChangeTimeline(requestState, window, controller.signal).then((data) => {
      if (controller.signal.aborted || requestSequence.current !== requestId) return;
      updateRecord(() => ({
        scope,
        frame: {
          phase: "ready",
          data,
          failure: null,
          refreshFailure: null,
          refreshing: false,
          updatedAt: Date.now(),
        },
      }));
      refreshController.acceptSuccess({
        refreshAfterSeconds: data.freshnessPolicy.refreshAfterSeconds,
      });
    }).catch((error: unknown) => {
      if (controller.signal.aborted || requestSequence.current !== requestId) return;
      const failure = error instanceof ResourcesPortFailure
        ? error
        : new ResourcesPortFailure("error");
      if (failure.code === "unauthorized") reportUnauthorized();
      refreshController.backgroundFailure();
      updateRecord((current) => ({
        scope,
        frame: current.scope === scope && current.frame.phase === "ready"
          ? {
            ...current.frame,
            refreshFailure: failure,
            refreshing: false,
          }
          : { phase: "failed", data: null, failure },
      }));
    });
    return () => controller.abort();
  }, [
    port,
    refreshController,
    reportUnauthorized,
    requestKey,
    requestState,
    scope,
    updateRecord,
    window,
  ]);

  const timelineInvalidationEnabled = scope !== null
    && windowSynchronized
    && record.scope === scope
    && record.frame.phase === "ready"
    && record.frame.data.freshnessPolicy.eventInvalidation;
  useEffect(() => {
    if (
      !timelineInvalidationEnabled
      || scope === null
      || timelinePort === undefined
      || workspaceId === null
    ) return undefined;
    const controller = new AbortController();
    void watchChangeTimelineInvalidations({
      filterState: requestState,
      onInvalidate() {
        refreshController.requestEventInvalidation();
        onResourceInvalidation?.();
      },
      port: timelinePort,
      signal: controller.signal,
      window,
      workspaceId,
    }).catch((error: unknown) => {
      if (controller.signal.aborted) return;
      if (error instanceof TimelineFailure && error.code === "forbidden") {
        reportUnauthorized();
      }
      // The server-declared poll cadence remains the bounded fallback for a
      // Timeline capability or stream failure.
    });
    return () => controller.abort();
  }, [
    refreshController,
    onResourceInvalidation,
    reportUnauthorized,
    requestState,
    scope,
    timelineInvalidationEnabled,
    timelinePort,
    window,
    workspaceId,
  ]);

  if (scope === null) return { phase: "idle", data: null, failure: null };
  return record.scope === scope
    ? record.frame
    : { phase: "loading", data: null, failure: null };
}

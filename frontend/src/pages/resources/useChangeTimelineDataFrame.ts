import { useEffect, useMemo, useRef, useState } from "react";
import type { TimelineRange, UnifiedFilterState } from "../../features/filters/filterContract";
import { parseProductFilterUrl, serializeProductFilterUrl } from "../../features/filters/filterUrl";
import type { ChangeTimelinePort, ChangeTimelineSnapshot } from "../../features/resources/changeTimelineContract";
import { ResourcesPortFailure, type ResourcesPortFailure as ResourcesPortFailureType } from "../../features/resources/resourcesContract";
import { timelineWindow } from "./scrubberMath";

export type ChangeTimelineFrame =
  | { phase: "idle"; data: null; failure: null }
  | { phase: "loading"; data: null; failure: null }
  | { phase: "ready"; data: ChangeTimelineSnapshot; failure: null }
  | { phase: "failed"; data: null; failure: ResourcesPortFailureType };

export function useChangeTimelineDataFrame(input: {
  active: boolean;
  authorityKey: string;
  filterState: UnifiedFilterState;
  port: ChangeTimelinePort;
  range: TimelineRange;
  reportUnauthorized: () => void;
  revision: number;
}): ChangeTimelineFrame {
  const { active, authorityKey, filterState, port, range, reportUnauthorized, revision } = input;
  const [anchorMs] = useState(() => Date.now());
  const requestSequence = useRef(0);
  const filterKey = useMemo(() => serializeProductFilterUrl(filterState), [filterState]);
  const requestState = useMemo(() => parseProductFilterUrl(filterKey).state, [filterKey]);
  const window = useMemo(() => timelineWindow(range, anchorMs), [anchorMs, range]);
  const scope = active ? `${authorityKey}:${filterKey}:${range}:r${revision}` : null;
  const [record, setRecord] = useState<{ scope: string | null; frame: ChangeTimelineFrame }>({
    scope: null,
    frame: { phase: "idle", data: null, failure: null },
  });

  useEffect(() => {
    const requestId = ++requestSequence.current;
    if (scope === null) return undefined;
    const controller = new AbortController();
    queueMicrotask(() => {
      if (controller.signal.aborted || requestSequence.current !== requestId) return;
      setRecord({ scope, frame: { phase: "loading", data: null, failure: null } });
    });
    void port.loadChangeTimeline(requestState, window, controller.signal).then((data) => {
      if (controller.signal.aborted || requestSequence.current !== requestId) return;
      setRecord({ scope, frame: { phase: "ready", data, failure: null } });
    }).catch((error: unknown) => {
      if (controller.signal.aborted || requestSequence.current !== requestId) return;
      const failure = error instanceof ResourcesPortFailure
        ? error
        : new ResourcesPortFailure("error");
      if (failure.code === "unauthorized") reportUnauthorized();
      setRecord({ scope, frame: { phase: "failed", data: null, failure } });
    });
    return () => controller.abort();
  }, [port, reportUnauthorized, requestState, scope, window]);

  if (scope === null) return { phase: "idle", data: null, failure: null };
  return record.scope === scope
    ? record.frame
    : { phase: "loading", data: null, failure: null };
}

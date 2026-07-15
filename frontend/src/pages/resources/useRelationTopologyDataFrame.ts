import { useEffect, useMemo, useRef, useState } from "react";

import type { UnifiedFilterState } from "../../features/filters/filterContract";
import {
  parseProductFilterUrl,
  serializeProductFilterUrl,
} from "../../features/filters/filterUrl";
import type {
  RelationTopologyPort,
  RelationTopologySnapshot,
} from "../../features/resources/relationTopologyContract";
import {
  ResourcesPortFailure,
  type ResourcesPortFailure as ResourcesPortFailureType,
} from "../../features/resources/resourcesContract";

export type RelationTopologyFrame =
  | { phase: "idle"; data: null; failure: null; refreshFailure: null; refreshing: false; updatedAt: 0 }
  | { phase: "loading"; data: null; failure: null; refreshFailure: null; refreshing: false; updatedAt: 0 }
  | { phase: "ready"; data: RelationTopologySnapshot; failure: null; refreshFailure: ResourcesPortFailureType | null; refreshing: boolean; updatedAt: number }
  | { phase: "failed"; data: null; failure: ResourcesPortFailureType; refreshFailure: null; refreshing: false; updatedAt: 0 };

export function useRelationTopologyDataFrame(input: {
  active: boolean;
  filterState: UnifiedFilterState;
  port: RelationTopologyPort;
  reportUnauthorized: () => void;
  revision: number;
}): RelationTopologyFrame {
  const { active, filterState, port, reportUnauthorized, revision } = input;
  const requestSequence = useRef(0);
  const [refreshTick, setRefreshTick] = useState(0);
  const filterKey = useMemo(
    () => serializeProductFilterUrl(filterState),
    [filterState],
  );
  const requestState = useMemo(
    () => parseProductFilterUrl(filterKey).state,
    [filterKey],
  );
  const scope = active ? filterKey : null;
  const [record, setRecord] = useState<{
    scope: string | null;
    frame: RelationTopologyFrame;
  }>({ scope: null, frame: idleFrame() });

  useEffect(() => {
    const requestId = ++requestSequence.current;
    if (scope === null) return undefined;
    const controller = new AbortController();
    queueMicrotask(() => {
      if (controller.signal.aborted || requestSequence.current !== requestId) return;
      setRecord((current) => current.scope === scope && current.frame.phase === "ready"
        ? { scope, frame: { ...current.frame, refreshFailure: null, refreshing: true } }
        : { scope, frame: loadingFrame() });
    });
    void port.loadRelationTopology(requestState, {}, controller.signal).then((data) => {
      if (controller.signal.aborted || requestSequence.current !== requestId) return;
      setRecord({
        scope,
        frame: {
          phase: "ready",
          data,
          failure: null,
          refreshFailure: null,
          refreshing: false,
          updatedAt: Date.now(),
        },
      });
    }).catch((error: unknown) => {
      if (controller.signal.aborted || requestSequence.current !== requestId) return;
      const failure = error instanceof ResourcesPortFailure
        ? error
        : new ResourcesPortFailure("error");
      if (failure.code === "unauthorized") reportUnauthorized();
      setRecord((current) => current.scope === scope && current.frame.phase === "ready"
        ? { scope, frame: { ...current.frame, refreshFailure: failure, refreshing: false } }
        : {
          scope,
          frame: {
            phase: "failed",
            data: null,
            failure,
            refreshFailure: null,
            refreshing: false,
            updatedAt: 0,
          },
        });
    });
    return () => controller.abort();
  }, [port, refreshTick, reportUnauthorized, requestState, revision, scope]);

  const refreshAfterSeconds = record.scope === scope && record.frame.phase === "ready"
    ? record.frame.data.refreshAfterSeconds
    : null;
  const refreshUpdatedAt = record.scope === scope && record.frame.phase === "ready"
    ? record.frame.updatedAt
    : 0;
  useEffect(() => {
    if (scope === null || refreshAfterSeconds === null) return undefined;
    const timer = window.setTimeout(
      () => setRefreshTick((current) => current + 1),
      refreshAfterSeconds * 1_000,
    );
    return () => window.clearTimeout(timer);
  }, [refreshAfterSeconds, refreshUpdatedAt, scope]);

  if (scope === null) return idleFrame();
  if (record.scope !== scope) return loadingFrame();
  return record.frame;
}

function idleFrame(): RelationTopologyFrame {
  return {
    phase: "idle",
    data: null,
    failure: null,
    refreshFailure: null,
    refreshing: false,
    updatedAt: 0,
  };
}

function loadingFrame(): RelationTopologyFrame {
  return {
    phase: "loading",
    data: null,
    failure: null,
    refreshFailure: null,
    refreshing: false,
    updatedAt: 0,
  };
}

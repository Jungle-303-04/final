import { useEffect, useMemo, useRef, useState } from "react";

import type { UnifiedFilterState } from "../../features/filters/filterContract";
import type {
  PhysicalTopologyPort,
  PhysicalTopologySnapshot,
} from "../../features/resources/physicalTopologyContract";
import {
  ResourcesPortFailure,
  type ResourcesPortFailure as ResourcesPortFailureType,
} from "../../features/resources/resourcesContract";
import {
  parseProductFilterUrl,
  serializeProductFilterUrl,
} from "../../features/filters/filterUrl";

export type PhysicalTopologyFrame =
  | { phase: "idle"; data: null; failure: null; refreshFailure: null; refreshing: false; updatedAt: 0 }
  | { phase: "loading"; data: null; failure: null; refreshFailure: null; refreshing: false; updatedAt: 0 }
  | { phase: "ready"; data: PhysicalTopologySnapshot; failure: null; refreshFailure: ResourcesPortFailureType | null; refreshing: boolean; updatedAt: number }
  | { phase: "failed"; data: null; failure: ResourcesPortFailureType; refreshFailure: null; refreshing: false; updatedAt: 0 };

export function usePhysicalTopologyDataFrame(input: {
  active: boolean;
  filterState: UnifiedFilterState;
  port: PhysicalTopologyPort;
  reportUnauthorized: () => void;
  revision: number;
}): PhysicalTopologyFrame {
  const {
    active,
    filterState,
    port,
    reportUnauthorized,
    revision,
  } = input;
  const requestSequence = useRef(0);
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
    frame: PhysicalTopologyFrame;
  }>({
    scope: null,
    frame: idleFrame(),
  });

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
    void port.loadPhysicalTopology(
      requestState,
      {},
      controller.signal,
    ).then((data) => {
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
  }, [
    port,
    reportUnauthorized,
    requestState,
    revision,
    scope,
  ]);

  if (scope === null) return idleFrame();
  if (record.scope !== scope) {
    return loadingFrame();
  }
  return record.frame;
}

function idleFrame(): PhysicalTopologyFrame {
  return {
    phase: "idle",
    data: null,
    failure: null,
    refreshFailure: null,
    refreshing: false,
    updatedAt: 0,
  };
}

function loadingFrame(): PhysicalTopologyFrame {
  return {
    phase: "loading",
    data: null,
    failure: null,
    refreshFailure: null,
    refreshing: false,
    updatedAt: 0,
  };
}

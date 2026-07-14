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
  | { phase: "idle"; data: null; failure: null }
  | { phase: "loading"; data: null; failure: null }
  | { phase: "ready"; data: RelationTopologySnapshot; failure: null }
  | { phase: "failed"; data: null; failure: ResourcesPortFailureType };

export function useRelationTopologyDataFrame(input: {
  active: boolean;
  filterState: UnifiedFilterState;
  port: RelationTopologyPort;
  reportUnauthorized: () => void;
  revision: number;
}): RelationTopologyFrame {
  const { active, filterState, port, reportUnauthorized, revision } = input;
  const requestSequence = useRef(0);
  const filterKey = useMemo(
    () => serializeProductFilterUrl(filterState),
    [filterState],
  );
  const requestState = useMemo(
    () => parseProductFilterUrl(filterKey).state,
    [filterKey],
  );
  const scope = active ? `${filterKey}:r${revision}` : null;
  const [record, setRecord] = useState<{
    scope: string | null;
    frame: RelationTopologyFrame;
  }>({ scope: null, frame: { phase: "idle", data: null, failure: null } });

  useEffect(() => {
    const requestId = ++requestSequence.current;
    if (scope === null) return undefined;
    const controller = new AbortController();
    queueMicrotask(() => {
      if (controller.signal.aborted || requestSequence.current !== requestId) return;
      setRecord({ scope, frame: { phase: "loading", data: null, failure: null } });
    });
    void port.loadRelationTopology(requestState, {}, controller.signal).then((data) => {
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
  }, [port, reportUnauthorized, requestState, scope]);

  if (scope === null) return { phase: "idle", data: null, failure: null };
  if (record.scope !== scope) return { phase: "loading", data: null, failure: null };
  return record.frame;
}

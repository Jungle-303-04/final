import { useEffect, useMemo, useRef, useState } from "react";

import type { UnifiedFilterState } from "../../features/filters/filterContract";
import type {
  ResourceMetricTimeRange,
  ResourceMetricsHistoryBatch,
  ResourceMetricsHistoryPort,
} from "../../features/resources/resourceMetricsHistoryContract";
import {
  ResourcesPortFailure,
  type ResourcesPortFailure as ResourcesPortFailureType,
} from "../../features/resources/resourcesContract";
import {
  parseProductFilterUrl,
  serializeProductFilterUrl,
} from "../../features/filters/filterUrl";
import {
  mergeLiveResourceMetricSeries,
  type ResourceMetricLiveSeries,
} from "./resourceMetricLiveSeries";

export type ResourceMetricsHistoryFrame =
  | { phase: "idle"; data: null; failure: null }
  | { phase: "loading"; data: null; failure: null }
  | { phase: "ready"; data: ResourceMetricsHistoryBatch; failure: null }
  | { phase: "failed"; data: null; failure: ResourcesPortFailureType };

export function useResourceMetricsHistoryDataFrame(input: {
  active: boolean;
  authorityKey: string;
  filterState: UnifiedFilterState;
  port: ResourceMetricsHistoryPort;
  range: ResourceMetricTimeRange;
  reportUnauthorized: () => void;
  resourceIds: string[];
  snapshotRevision: number | null;
  liveSeries?: readonly ResourceMetricLiveSeries[];
}): ResourceMetricsHistoryFrame {
  const {
    active,
    authorityKey,
    filterState,
    port,
    range,
    reportUnauthorized,
    resourceIds: requestedResourceIds,
    snapshotRevision,
  } = input;
  const liveSeries = input.liveSeries ?? [];
  const requestSequence = useRef(0);
  const filterKey = useMemo(
    () => serializeProductFilterUrl(filterState),
    [filterState],
  );
  const requestState = useMemo(
    () => parseProductFilterUrl(filterKey).state,
    [filterKey],
  );
  const idsKey = requestedResourceIds.join("\u001f");
  const resourceIds = useMemo(
    () => idsKey === "" ? [] : idsKey.split("\u001f"),
    [idsKey],
  );
  const scope = active && resourceIds.length > 0 && snapshotRevision !== null
    ? `${authorityKey}:${filterKey}:${snapshotRevision}:${range}:${idsKey}`
    : null;
  const [record, setRecord] = useState<{
    scope: string | null;
    frame: ResourceMetricsHistoryFrame;
  }>({ scope: null, frame: { phase: "idle", data: null, failure: null } });

  useEffect(() => {
    const requestId = ++requestSequence.current;
    if (scope === null || snapshotRevision === null) return undefined;
    const controller = new AbortController();
    queueMicrotask(() => {
      if (controller.signal.aborted || requestSequence.current !== requestId) return;
      setRecord({ scope, frame: { phase: "loading", data: null, failure: null } });
    });
    void port.loadResourceMetricsHistory(
      requestState,
      resourceIds,
      { snapshotRevision, range, limit: 60 },
      controller.signal,
    ).then((data) => {
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
  }, [
    port,
    reportUnauthorized,
    range,
    requestState,
    resourceIds,
    scope,
    snapshotRevision,
  ]);

  if (scope === null) return { phase: "idle", data: null, failure: null };
  const frame: ResourceMetricsHistoryFrame = record.scope === scope
    ? record.frame
    : { phase: "loading", data: null, failure: null };
  return frame.phase === "ready" && liveSeries.length > 0
    ? { ...frame, data: mergeLiveResourceMetricSeries(frame.data, liveSeries) }
    : frame;
}

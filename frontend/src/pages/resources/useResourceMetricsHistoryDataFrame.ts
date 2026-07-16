import { useEffect, useMemo, useRef, useState, type MutableRefObject } from "react";

import type { UnifiedFilterState } from "../../features/filters/filterContract";
import type {
  ResourceMetricTimeRange,
  ResourceMetricsHistoryBatch,
  ResourceMetricsHistoryPort,
  ResourcesRefreshPolicyKey,
  ScopedResourceMetricsObservation,
} from "../../features/resources/resourceMetricsHistoryContract";
import type { ResourcesFilterSnapshot } from "../../features/resources/resourcesFilterContract";
import type { ResourceSummary } from "../../features/resources/resourcesContract";
import type { BrowserRefreshPolicyRegistry } from "../../shared/data/browserRefreshPolicyRegistry";
import { useServerRefreshScheduler } from "../../shared/data/useServerRefreshScheduler";
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
  | { phase: "idle"; data: null; failure: null; refreshFailure: null; refreshing: false; unavailableRetry: null }
  | { phase: "loading"; data: null; failure: null; refreshFailure: null; refreshing: false; unavailableRetry: null }
  | {
      phase: "ready";
      data: ResourceMetricsHistoryBatch;
      failure: null;
      refreshFailure: ResourcesPortFailureType | null;
      refreshing: boolean;
      unavailableRetry: ResourceMetricsUnavailableRetry | null;
    }
  | { phase: "failed"; data: null; failure: ResourcesPortFailureType; refreshFailure: null; refreshing: false; unavailableRetry: null };

export interface ResourceMetricsUnavailableRetry {
  attempt: number;
  limit: number;
  exhausted: boolean;
  nextAfterSeconds: number;
}

type ScopedMetricsFrame =
  | { phase: "idle"; data: null; failure: null; refreshFailure: null; refreshing: false }
  | { phase: "loading"; data: null; failure: null; refreshFailure: null; refreshing: false }
  | {
      phase: "ready";
      data: ScopedResourceMetricsObservation;
      failure: null;
      refreshFailure: ResourcesPortFailureType | null;
      refreshing: boolean;
    }
  | { phase: "failed"; data: null; failure: ResourcesPortFailureType; refreshFailure: null; refreshing: false };

export function useResourceMetricsHistoryDataFrame(input: {
  active: boolean;
  authorityKey: string;
  filterState: UnifiedFilterState;
  port: ResourceMetricsHistoryPort;
  range: ResourceMetricTimeRange;
  refreshPolicies: BrowserRefreshPolicyRegistry<ResourcesRefreshPolicyKey>;
  reportUnauthorized: () => void;
  resourceIds: string[];
  snapshotRevision: number | null;
  liveSeries?: readonly ResourceMetricLiveSeries[];
  observedResource?: ResourceSummary | null;
  scopeSnapshot?: ResourcesFilterSnapshot | null;
}): ResourceMetricsHistoryFrame {
  const {
    active,
    authorityKey,
    filterState,
    port,
    range,
    refreshPolicies,
    reportUnauthorized,
    resourceIds: requestedResourceIds,
    snapshotRevision,
  } = input;
  const liveSeries = input.liveSeries ?? [];
  const observedResource = input.observedResource ?? null;
  const scopeSnapshot = input.scopeSnapshot ?? null;
  const requestSequence = useRef(0);
  const scopedRequestSequence = useRef(0);
  const unavailableAttempts = useRef({ scope: null as string | null, count: 0 });
  const [refreshRevision, setRefreshRevision] = useState(0);
  const [scopedRefreshRevision, setScopedRefreshRevision] = useState(0);
  const refreshController = useServerRefreshScheduler(
    () => setRefreshRevision((current) => current + 1),
  );
  const scopedRefreshController = useServerRefreshScheduler(
    () => setScopedRefreshRevision((current) => current + 1),
  );
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
  const canLoadScoped = observedResource !== null && port.loadScopedResourceMetrics !== undefined;
  const scope = active && (resourceIds.length > 0 || canLoadScoped) && snapshotRevision !== null
    ? `${authorityKey}:${filterKey}:${snapshotRevision}:${range}:${idsKey}`
    : null;
  const scopedScope = scope !== null && canLoadScoped && observedResource !== null
    ? `${scope}:${observedResource.inventoryKey}`
    : null;
  const [record, setRecord] = useState<{
    scope: string | null;
    frame: ResourceMetricsHistoryFrame;
  }>({ scope: null, frame: idleFrame() });
  const [scopedRecord, setScopedRecord] = useState<{
    scope: string | null;
    frame: ScopedMetricsFrame;
  }>({ scope: null, frame: idleScopedFrame() });

  useEffect(() => {
    unavailableAttempts.current = { scope, count: 0 };
    refreshController.backgroundFailure();
  }, [refreshController, scope]);

  useEffect(() => {
    scopedRefreshController.backgroundFailure();
  }, [scopedRefreshController, scopedScope]);

  useEffect(() => {
    const requestId = ++requestSequence.current;
    if (scope === null || snapshotRevision === null || resourceIds.length === 0) return undefined;
    const controller = new AbortController();
    queueMicrotask(() => {
      if (controller.signal.aborted || requestSequence.current !== requestId) return;
      setRecord((current) => current.scope === scope && current.frame.phase === "ready"
        ? {
            scope,
            frame: {
              ...current.frame,
              refreshFailure: null,
              refreshing: true,
            },
          }
        : { scope, frame: loadingFrame() });
    });
    void port.loadResourceMetricsHistory(
      requestState,
      resourceIds,
      { snapshotRevision, range, limit: 60 },
      controller.signal,
    ).then(async (data) => {
      if (controller.signal.aborted || requestSequence.current !== requestId) return;
      let policy;
      try {
        policy = await refreshPolicies.getPolicy(data.refreshPolicyKey, controller.signal);
      } catch {
        if (controller.signal.aborted || requestSequence.current !== requestId) return;
        refreshController.backgroundFailure();
        setRecord({ scope, frame: readyFrame(data, null, null) });
        return;
      }
      if (controller.signal.aborted || requestSequence.current !== requestId) return;
      const retry = unavailableRetry(scope, data, policy, unavailableAttempts);
      setRecord({ scope, frame: readyFrame(data, retry, null) });
      refreshController.acceptSuccess({
        refreshAfterSeconds: retry !== null && !retry.exhausted
          ? retry.nextAfterSeconds
          : policy.refreshAfterSeconds,
      });
    }).catch((error: unknown) => {
      if (controller.signal.aborted || requestSequence.current !== requestId) return;
      const failure = resourceMetricsFailure(error);
      if (failure.code === "unauthorized") reportUnauthorized();
      refreshController.backgroundFailure();
      setRecord((current) => current.scope === scope && current.frame.phase === "ready"
        ? {
            scope,
            frame: {
              ...current.frame,
              refreshFailure: failure,
              refreshing: false,
            },
          }
        : { scope, frame: failedFrame(failure) });
    });
    return () => controller.abort();
  }, [
    port,
    range,
    refreshController,
    refreshPolicies,
    refreshRevision,
    reportUnauthorized,
    requestState,
    resourceIds,
    scope,
    snapshotRevision,
  ]);

  useEffect(() => {
    const requestId = ++scopedRequestSequence.current;
    const load = port.loadScopedResourceMetrics;
    if (scopedScope === null || observedResource === null || load === undefined) return undefined;
    const controller = new AbortController();
    queueMicrotask(() => {
      if (controller.signal.aborted || scopedRequestSequence.current !== requestId) return;
      setScopedRecord((current) => current.scope === scopedScope && current.frame.phase === "ready"
        ? {
            scope: scopedScope,
            frame: {
              ...current.frame,
              refreshFailure: null,
              refreshing: true,
            },
          }
        : { scope: scopedScope, frame: loadingScopedFrame() });
    });
    void load(observedResource, range, controller.signal).then(async (data) => {
      if (controller.signal.aborted || scopedRequestSequence.current !== requestId) return;
      let policy;
      try {
        policy = await refreshPolicies.getPolicy(data.refreshPolicyKey, controller.signal);
      } catch {
        if (controller.signal.aborted || scopedRequestSequence.current !== requestId) return;
        scopedRefreshController.backgroundFailure();
        setScopedRecord({ scope: scopedScope, frame: readyScopedFrame(data, null) });
        return;
      }
      if (controller.signal.aborted || scopedRequestSequence.current !== requestId) return;
      setScopedRecord({ scope: scopedScope, frame: readyScopedFrame(data, null) });
      scopedRefreshController.acceptSuccess(policy, { coldEmpty: data.series === null });
    }).catch((error: unknown) => {
      if (controller.signal.aborted || scopedRequestSequence.current !== requestId) return;
      const failure = resourceMetricsFailure(error);
      if (failure.code === "unauthorized") reportUnauthorized();
      scopedRefreshController.backgroundFailure();
      setScopedRecord((current) => current.scope === scopedScope && current.frame.phase === "ready"
        ? {
            scope: scopedScope,
            frame: {
              ...current.frame,
              refreshFailure: failure,
              refreshing: false,
            },
          }
        : { scope: scopedScope, frame: failedScopedFrame(failure) });
    });
    return () => controller.abort();
  }, [
    observedResource,
    port,
    range,
    refreshPolicies,
    reportUnauthorized,
    scopedRefreshController,
    scopedRefreshRevision,
    scopedScope,
  ]);

  if (scope === null) return idleFrame();
  const storedFrame = resourceIds.length === 0
    ? idleFrame()
    : record.scope === scope
      ? record.frame
      : loadingFrame();
  const scopedFrame = scopedScope === null
    ? idleScopedFrame()
    : scopedRecord.scope === scopedScope
      ? scopedRecord.frame
      : loadingScopedFrame();
  const frame = mergeScopedFrame(storedFrame, scopedFrame, scopeSnapshot);
  return frame.phase === "ready" && liveSeries.length > 0
    ? { ...frame, data: mergeLiveResourceMetricSeries(frame.data, liveSeries) }
    : frame;
}

function mergeScopedFrame(
  stored: ResourceMetricsHistoryFrame,
  scoped: ScopedMetricsFrame,
  snapshot: ResourcesFilterSnapshot | null,
): ResourceMetricsHistoryFrame {
  if (scoped.phase === "idle") return stored;
  if (scoped.phase === "loading") {
    return stored.phase === "ready"
      ? { ...stored, refreshing: true }
      : loadingFrame();
  }
  if (scoped.phase === "failed") {
    return stored.phase === "ready"
      ? { ...stored, refreshFailure: scoped.failure, refreshing: false }
      : failedFrame(scoped.failure);
  }
  if (stored.phase === "ready") {
    const scopedSeries = scoped.data.series;
    const series = scopedSeries === null
      ? stored.data.series
      : [
          ...stored.data.series.filter((item) => item.resourceId !== scopedSeries.resourceId),
          scopedSeries,
        ];
    const partialReasonCodes = uniqueReasons(
      stored.data.partialReasonCodes,
      scoped.data.partialReasonCodes,
    );
    return {
      ...stored,
      data: {
        ...stored.data,
        series,
        completeness: series.length === 0
          ? "unavailable"
          : stored.data.completeness === "exact" && scoped.data.completeness === "exact"
            ? "exact"
            : "partial",
        partialReasonCodes,
      },
      refreshFailure: scoped.refreshFailure ?? stored.refreshFailure,
      refreshing: stored.refreshing || scoped.refreshing,
    };
  }
  if (snapshot === null) return loadingFrame();
  const fallbackFailure = scoped.refreshFailure ?? (stored.phase === "failed" ? stored.failure : null);
  return {
    phase: "ready",
    data: {
      refreshPolicyKey: scoped.data.refreshPolicyKey,
      series: scoped.data.series === null ? [] : [scoped.data.series],
      completeness: scoped.data.completeness,
      partialReasonCodes: scoped.data.partialReasonCodes,
      snapshot,
    },
    failure: null,
    refreshFailure: fallbackFailure,
    refreshing: scoped.refreshing || stored.phase === "loading",
    unavailableRetry: null,
  };
}

function uniqueReasons(...groups: string[][]): string[] {
  return Array.from(new Set(groups.flat()));
}

function resourceMetricsFailure(error: unknown): ResourcesPortFailureType {
  return error instanceof ResourcesPortFailure
    ? error
    : new ResourcesPortFailure("error");
}

function unavailableRetry(
  scope: string,
  data: ResourceMetricsHistoryBatch,
  policy: Awaited<ReturnType<BrowserRefreshPolicyRegistry<ResourcesRefreshPolicyKey>["getPolicy"]>>,
  attempts: MutableRefObject<{ scope: string | null; count: number }>,
): ResourceMetricsUnavailableRetry | null {
  if (data.completeness !== "unavailable") {
    attempts.current = { scope, count: 0 };
    return null;
  }
  if (policy.retryAfterSeconds === null || policy.retryLimit === null) return null;
  const count = attempts.current.scope === scope ? attempts.current.count + 1 : 1;
  attempts.current = { scope, count };
  return {
    attempt: Math.min(count, policy.retryLimit),
    limit: policy.retryLimit,
    exhausted: count > policy.retryLimit,
    nextAfterSeconds: count > policy.retryLimit
      ? policy.refreshAfterSeconds
      : policy.retryAfterSeconds,
  };
}

function idleFrame(): ResourceMetricsHistoryFrame {
  return {
    phase: "idle",
    data: null,
    failure: null,
    refreshFailure: null,
    refreshing: false,
    unavailableRetry: null,
  };
}

function loadingFrame(): ResourceMetricsHistoryFrame {
  return {
    phase: "loading",
    data: null,
    failure: null,
    refreshFailure: null,
    refreshing: false,
    unavailableRetry: null,
  };
}

function readyFrame(
  data: ResourceMetricsHistoryBatch,
  unavailableRetryState: ResourceMetricsUnavailableRetry | null,
  refreshFailure: ResourcesPortFailureType | null,
): ResourceMetricsHistoryFrame {
  return {
    phase: "ready",
    data,
    failure: null,
    refreshFailure,
    refreshing: false,
    unavailableRetry: unavailableRetryState,
  };
}

function failedFrame(failure: ResourcesPortFailureType): ResourceMetricsHistoryFrame {
  return {
    phase: "failed",
    data: null,
    failure,
    refreshFailure: null,
    refreshing: false,
    unavailableRetry: null,
  };
}

function idleScopedFrame(): ScopedMetricsFrame {
  return {
    phase: "idle",
    data: null,
    failure: null,
    refreshFailure: null,
    refreshing: false,
  };
}

function loadingScopedFrame(): ScopedMetricsFrame {
  return {
    phase: "loading",
    data: null,
    failure: null,
    refreshFailure: null,
    refreshing: false,
  };
}

function readyScopedFrame(
  data: ScopedResourceMetricsObservation,
  refreshFailure: ResourcesPortFailureType | null,
): ScopedMetricsFrame {
  return {
    phase: "ready",
    data,
    failure: null,
    refreshFailure,
    refreshing: false,
  };
}

function failedScopedFrame(failure: ResourcesPortFailureType): ScopedMetricsFrame {
  return {
    phase: "failed",
    data: null,
    failure,
    refreshFailure: null,
    refreshing: false,
  };
}

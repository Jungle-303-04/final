import { useEffect, useMemo, useRef, useState, type MutableRefObject } from "react";

import type { UnifiedFilterState } from "../../features/filters/filterContract";
import type {
  ResourceMetricTimeRange,
  ResourceMetricsHistoryBatch,
  ResourceMetricsHistoryPort,
  ResourcesRefreshPolicyKey,
} from "../../features/resources/resourceMetricsHistoryContract";
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
  const requestSequence = useRef(0);
  const unavailableAttempts = useRef({ scope: null as string | null, count: 0 });
  const [refreshRevision, setRefreshRevision] = useState(0);
  const refreshController = useServerRefreshScheduler(
    () => setRefreshRevision((current) => current + 1),
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
  const scope = active && resourceIds.length > 0 && snapshotRevision !== null
    ? `${authorityKey}:${filterKey}:${snapshotRevision}:${range}:${idsKey}`
    : null;
  const [record, setRecord] = useState<{
    scope: string | null;
    frame: ResourceMetricsHistoryFrame;
  }>({ scope: null, frame: idleFrame() });

  useEffect(() => {
    unavailableAttempts.current = { scope, count: 0 };
    refreshController.backgroundFailure();
  }, [refreshController, scope]);

  useEffect(() => {
    const requestId = ++requestSequence.current;
    if (scope === null || snapshotRevision === null) return undefined;
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
        setRecord({
          scope,
          frame: readyFrame(data, null, null),
        });
        return;
      }
      if (controller.signal.aborted || requestSequence.current !== requestId) return;
      const retry = unavailableRetry(scope, data, policy, unavailableAttempts);
      setRecord({
        scope,
        frame: readyFrame(data, retry, null),
      });
      refreshController.acceptSuccess({
        refreshAfterSeconds: retry !== null && !retry.exhausted
          ? retry.nextAfterSeconds
          : policy.refreshAfterSeconds,
      });
    }).catch((error: unknown) => {
      if (controller.signal.aborted || requestSequence.current !== requestId) return;
      const failure = error instanceof ResourcesPortFailure
        ? error
        : new ResourcesPortFailure("error");
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
    reportUnauthorized,
    range,
    refreshController,
    refreshPolicies,
    refreshRevision,
    requestState,
    resourceIds,
    scope,
    snapshotRevision,
  ]);

  if (scope === null) return idleFrame();
  const frame: ResourceMetricsHistoryFrame = record.scope === scope
    ? record.frame
    : loadingFrame();
  return frame.phase === "ready" && liveSeries.length > 0
    ? { ...frame, data: mergeLiveResourceMetricSeries(frame.data, liveSeries) }
    : frame;
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

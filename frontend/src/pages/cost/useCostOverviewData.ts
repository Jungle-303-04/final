import { useEffect, useMemo, useState } from "react";

import {
  ASYNC_LOADING,
  asyncResourceFailure,
  asyncResourceSuccess,
  isAbortError,
  startAsyncResource,
  type AsyncResourceState,
} from "../../shared/data/asyncResourceState";
import { acquireSharedRequest } from "../../shared/data/sharedRequest";
import {
  CostPortFailure,
  type CostOverview,
  type CostPort,
  type CostTimeRange,
} from "../../features/cost/costContract";

export function useCostOverview(
  port: CostPort,
  request: { clusterIds: readonly string[]; timeRange: CostTimeRange },
): {
  frame: AsyncResourceState<CostOverview, CostPortFailure>;
  refresh: () => void;
} {
  const scopeKey = useMemo(
    () => [...new Set(request.clusterIds)].sort().join("\u001f"),
    [request.clusterIds],
  );
  const canonicalRequest = useMemo(() => ({
    clusterIds: scopeKey ? scopeKey.split("\u001f") : [],
    timeRange: request.timeRange,
  }), [request.timeRange, scopeKey]);
  const [revision, setRevision] = useState(0);
  const [completedAt, setCompletedAt] = useState(0);
  const [frame, setFrame] = useState<AsyncResourceState<CostOverview, CostPortFailure>>(ASYNC_LOADING);

  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (active) setFrame((current) => startAsyncResource(current));
    });
    const sharedRequest = acquireSharedRequest(
      port,
      `cost-overview:${scopeKey}:${request.timeRange}:r${revision}`,
      (signal) => port.getOverview(canonicalRequest, signal),
    );
    void sharedRequest.promise.then(
      (data) => {
        if (!active) return;
        setFrame(asyncResourceSuccess(data));
        setCompletedAt(Date.now());
      },
      (error: unknown) => {
        if (!active || isAbortError(error)) return;
        setFrame((current) => asyncResourceFailure(current, toPortFailure(error)));
      },
    );
    return () => {
      active = false;
      sharedRequest.release();
    };
  }, [canonicalRequest, port, request.timeRange, revision, scopeKey]);

  const refreshAfterSeconds = frame.phase === "ready" ? frame.data.refreshAfterSeconds : null;
  useEffect(() => {
    if (refreshAfterSeconds === null || completedAt === 0) return undefined;
    const timer = window.setTimeout(
      () => setRevision((current) => current + 1),
      refreshAfterSeconds * 1_000,
    );
    return () => window.clearTimeout(timer);
  }, [completedAt, refreshAfterSeconds, request.timeRange, scopeKey]);

  return { frame, refresh: () => setRevision((current) => current + 1) };
}

function toPortFailure(error: unknown): CostPortFailure {
  return error instanceof CostPortFailure ? error : new CostPortFailure("error");
}

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
import { useServerRefreshScheduler } from "../../shared/data/useServerRefreshScheduler";
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
  const [frame, setFrame] = useState<AsyncResourceState<CostOverview, CostPortFailure>>(ASYNC_LOADING);
  const refreshController = useServerRefreshScheduler(
    () => setRevision((current) => current + 1),
  );

  useEffect(() => {
    refreshController.backgroundFailure();
  }, [refreshController, request.timeRange, scopeKey]);

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
        refreshController.acceptSuccess(data);
      },
      (error: unknown) => {
        if (!active || isAbortError(error)) return;
        refreshController.backgroundFailure();
        setFrame((current) => asyncResourceFailure(current, toPortFailure(error)));
      },
    );
    return () => {
      active = false;
      sharedRequest.release();
    };
  }, [canonicalRequest, port, refreshController, request.timeRange, revision, scopeKey]);

  return { frame, refresh: refreshController.requestRefresh };
}

function toPortFailure(error: unknown): CostPortFailure {
  return error instanceof CostPortFailure ? error : new CostPortFailure("error");
}

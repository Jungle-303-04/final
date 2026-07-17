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
  type CostRefreshChannel,
  type CostTimeRange,
} from "../../features/cost/costContract";

export function useCostOverview(
  port: CostPort,
  request: {
    clusterIds: readonly string[];
    namespaces: readonly string[];
    timeRange: CostTimeRange;
  },
  refreshChannel: CostRefreshChannel = "summary",
): {
  frame: AsyncResourceState<CostOverview, CostPortFailure>;
  refresh: () => void;
} {
  const scopeKey = useMemo(
    () => `${[...new Set(request.clusterIds)].sort().join("\u001f")}\u001e${[...new Set(request.namespaces)].sort().join("\u001f")}`,
    [request.clusterIds, request.namespaces],
  );
  const canonicalRequest = useMemo(() => ({
    clusterIds: (scopeKey.split("\u001e")[0] ?? "").split("\u001f").filter(Boolean),
    namespaces: (scopeKey.split("\u001e")[1] ?? "").split("\u001f").filter(Boolean),
    timeRange: request.timeRange,
  }), [request.timeRange, scopeKey]);
  const [revision, setRevision] = useState(0);
  const [frame, setFrame] = useState<AsyncResourceState<CostOverview, CostPortFailure>>(ASYNC_LOADING);
  const refreshController = useServerRefreshScheduler(
    () => setRevision((current) => current + 1),
  );

  useEffect(() => {
    refreshController.backgroundFailure();
  }, [refreshChannel, refreshController, request.timeRange, scopeKey]);

  useEffect(() => {
    let active = true;
    let dataSucceeded = false;
    let policyAccepted = false;
    let refreshPolicy: Awaited<ReturnType<CostPort["loadRefreshPolicy"]>> | null = null;
    const acceptRefreshPolicy = () => {
      if (!active || !dataSucceeded || policyAccepted || refreshPolicy === null) return;
      policyAccepted = true;
      refreshController.acceptSuccess(refreshPolicy);
    };
    queueMicrotask(() => {
      if (active) setFrame((current) => startAsyncResource(current));
    });
    const dataRequest = acquireSharedRequest(
      port,
      `cost-overview:${scopeKey}:${request.timeRange}:${refreshChannel}:r${revision}`,
      (signal) => port.getOverview(canonicalRequest, signal),
    );
    const policyRequest = acquireSharedRequest(
      port,
      `cost-refresh-policy:${refreshChannel}`,
      (signal) => port.loadRefreshPolicy(refreshChannel, signal),
    );
    void dataRequest.promise.then(
      (data) => {
        if (!active) return;
        dataSucceeded = true;
        setFrame(asyncResourceSuccess(data));
        acceptRefreshPolicy();
      },
      (error: unknown) => {
        if (!active || isAbortError(error)) return;
        refreshController.backgroundFailure();
        setFrame((current) => asyncResourceFailure(current, toPortFailure(error)));
      },
    );
    void policyRequest.promise.then(
      (policy) => {
        refreshPolicy = policy;
        acceptRefreshPolicy();
      },
      (error: unknown) => {
        if (active && !isAbortError(error)) refreshController.backgroundFailure();
      },
    );
    return () => {
      active = false;
      dataRequest.release();
      policyRequest.release();
    };
  }, [
    canonicalRequest,
    port,
    refreshChannel,
    refreshController,
    request.timeRange,
    revision,
    scopeKey,
  ]);

  return { frame, refresh: refreshController.requestRefresh };
}

function toPortFailure(error: unknown): CostPortFailure {
  return error instanceof CostPortFailure ? error : new CostPortFailure("error");
}

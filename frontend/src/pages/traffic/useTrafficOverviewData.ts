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
  TrafficPortFailure,
  type TrafficOverview,
  type TrafficOverviewRequest,
  type TrafficPort,
  type TrafficSources,
} from "../../features/traffic/trafficContract";

export function useTrafficOverview(
  port: TrafficPort,
  request: TrafficOverviewRequest,
): {
  frame: AsyncResourceState<TrafficOverview, TrafficPortFailure>;
  sourcesFrame: AsyncResourceState<TrafficSources, TrafficPortFailure>;
  refresh: () => void;
} {
  const [revision, setRevision] = useState(0);
  const refreshController = useServerRefreshScheduler(
    () => setRevision((current) => current + 1),
  );
  const canonicalRequest = useMemo(() => ({
    clusterIds: [...new Set(request.clusterIds)].sort(),
    namespaces: [...new Set(request.namespaces)].sort(),
    since: request.since,
    protocols: [...new Set(request.protocols ?? [])].sort(),
    verdicts: [...new Set(request.verdicts ?? [])].sort(),
    sort: request.sort,
    order: request.order,
    cursor: request.cursor,
    limit: request.limit,
  }), [
    request.clusterIds,
    request.cursor,
    request.limit,
    request.namespaces,
    request.order,
    request.protocols,
    request.since,
    request.sort,
    request.verdicts,
  ]);
  const scopeKey = JSON.stringify(canonicalRequest);
  const [frame, setFrame] = useState<AsyncResourceState<TrafficOverview, TrafficPortFailure>>(ASYNC_LOADING);
  const [sourcesFrame, setSourcesFrame] = useState<
    AsyncResourceState<TrafficSources, TrafficPortFailure>
  >(ASYNC_LOADING);

  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (active) {
        setFrame((current) => startAsyncResource(current));
        setSourcesFrame((current) => startAsyncResource(current));
      }
    });
    const overviewRequest = acquireSharedRequest(
      port,
      `traffic-overview:${scopeKey}:r${revision}`,
      (signal) => port.getOverview(canonicalRequest, signal),
    );
    const sourcesRequest = acquireSharedRequest(
      port,
      `traffic-sources:${canonicalRequest.clusterIds.join("\u001f")}:r${revision}`,
      (signal) => port.getSources({ clusterIds: canonicalRequest.clusterIds }, signal),
    );
    void overviewRequest.promise.then(
      (data) => {
        if (active) {
          setFrame(asyncResourceSuccess(data));
          refreshController.acceptSuccess({ refreshAfterSeconds: data.refreshAfterSeconds });
        }
      },
      (error: unknown) => {
        if (!active || isAbortError(error)) return;
        refreshController.backgroundFailure();
        setFrame((current) => asyncResourceFailure(current, toPortFailure(error)));
      },
    );
    void sourcesRequest.promise.then(
      (data) => {
        if (active) setSourcesFrame(asyncResourceSuccess(data));
      },
      (error: unknown) => {
        if (!active || isAbortError(error)) return;
        setSourcesFrame((current) => asyncResourceFailure(current, toPortFailure(error)));
      },
    );
    return () => {
      active = false;
      overviewRequest.release();
      sourcesRequest.release();
    };
  }, [canonicalRequest, port, refreshController, revision, scopeKey]);

  return { frame, sourcesFrame, refresh: refreshController.requestRefresh };
}

function toPortFailure(error: unknown): TrafficPortFailure {
  return error instanceof TrafficPortFailure ? error : new TrafficPortFailure("error");
}

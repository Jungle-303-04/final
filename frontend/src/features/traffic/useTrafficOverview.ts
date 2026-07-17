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
import { useVisibleRefreshClock } from "../../shared/data/useVisibleRefreshClock";
import {
  TrafficPortFailure,
  type TrafficOverview,
  type TrafficOverviewRequest,
  type TrafficPort,
  type TrafficSources,
} from "./trafficContract";

const TRAFFIC_SCOPE_REFRESH_INTERVAL_MS = 30_000;

export function useTrafficOverview(
  port: TrafficPort,
  request: TrafficOverviewRequest,
): {
  frame: AsyncResourceState<TrafficOverview, TrafficPortFailure>;
  sourcesFrame: AsyncResourceState<TrafficSources, TrafficPortFailure>;
  refresh: () => void;
} {
  const { refresh, revision } = useVisibleRefreshClock(true, TRAFFIC_SCOPE_REFRESH_INTERVAL_MS);
  const canonicalRequest = useMemo(() => ({
    clusterIds: [...new Set(request.clusterIds)].sort(),
    namespaces: [...new Set(request.namespaces)].sort(),
  }), [request.clusterIds, request.namespaces]);
  const scopeKey = `${canonicalRequest.clusterIds.join("\u001f")}|${canonicalRequest.namespaces.join("\u001f")}`;
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
        if (active) setFrame(asyncResourceSuccess(data));
      },
      (error: unknown) => {
        if (!active || isAbortError(error)) return;
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
  }, [canonicalRequest, port, revision, scopeKey]);

  return { frame, sourcesFrame, refresh };
}

function toPortFailure(error: unknown): TrafficPortFailure {
  return error instanceof TrafficPortFailure ? error : new TrafficPortFailure("error");
}

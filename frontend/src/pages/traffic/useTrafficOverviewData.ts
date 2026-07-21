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
  type TrafficPort,
} from "../../features/traffic/trafficContract";

const TRAFFIC_SCOPE_REFRESH_INTERVAL_MS = 30_000;

export function useTrafficOverview(
  port: TrafficPort,
  request: { clusterIds: readonly string[]; namespaces: readonly string[] },
): {
  frame: AsyncResourceState<TrafficOverview, TrafficPortFailure>;
  refresh: () => void;
} {
  const { refresh, revision } = useVisibleRefreshClock(true, TRAFFIC_SCOPE_REFRESH_INTERVAL_MS);
  const canonicalRequest = useMemo(() => ({
    clusterIds: [...new Set(request.clusterIds)].sort(),
    namespaces: [...new Set(request.namespaces)].sort(),
  }), [request.clusterIds, request.namespaces]);
  const scopeKey = `${canonicalRequest.clusterIds.join("\u001f")}|${canonicalRequest.namespaces.join("\u001f")}`;
  const [frame, setFrame] = useState<AsyncResourceState<TrafficOverview, TrafficPortFailure>>(ASYNC_LOADING);

  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (active) setFrame((current) => startAsyncResource(current));
    });
    const sharedRequest = acquireSharedRequest(
      port,
      `traffic-overview:${scopeKey}:r${revision}`,
      (signal) => port.getOverview(canonicalRequest, signal),
    );
    void sharedRequest.promise.then(
      (data) => {
        if (active) setFrame(asyncResourceSuccess(data));
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
  }, [canonicalRequest, port, revision, scopeKey]);

  return { frame, refresh };
}

function toPortFailure(error: unknown): TrafficPortFailure {
  return error instanceof TrafficPortFailure ? error : new TrafficPortFailure("error");
}

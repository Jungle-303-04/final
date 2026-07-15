import { useEffect, useMemo, useState } from "react";

import {
  ASYNC_IDLE,
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
  HelmPortFailure,
  type HelmPort,
  type HelmReleaseDetail,
  type HelmReleaseDetailRequest,
  type HelmReleaseList,
} from "../../features/helm/helmContract";

const HELM_READ_REFRESH_INTERVAL_MS = 30_000;

export function useHelmReleaseList(
  port: HelmPort,
  clusterIds: readonly string[],
): {
  frame: AsyncResourceState<HelmReleaseList, HelmPortFailure>;
  refresh: () => void;
} {
  const { refresh, revision } = useVisibleRefreshClock(true, HELM_READ_REFRESH_INTERVAL_MS);
  const canonicalClusterIds = useMemo(
    () => [...new Set(clusterIds)].sort(),
    [clusterIds],
  );
  const scopeKey = canonicalClusterIds.join("\u001f");
  const [frame, setFrame] = useState<AsyncResourceState<HelmReleaseList, HelmPortFailure>>(ASYNC_LOADING);

  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (active) setFrame((current) => startAsyncResource(current));
    });
    const request = acquireSharedRequest(
      port,
      `helm-releases:${scopeKey}:r${revision}`,
      (signal) => port.listReleases({ clusterIds: canonicalClusterIds }, signal),
    );
    void request.promise.then(
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
      request.release();
    };
  }, [canonicalClusterIds, port, revision, scopeKey]);

  return { frame, refresh };
}

export function useHelmReleaseDetail(
  port: HelmPort,
  request: HelmReleaseDetailRequest | null,
): {
  frame: AsyncResourceState<HelmReleaseDetail, HelmPortFailure>;
  refresh: () => void;
} {
  const { refresh, revision } = useVisibleRefreshClock(request !== null, HELM_READ_REFRESH_INTERVAL_MS);
  const identityKey = request
    ? [request.clusterId, request.namespace, request.releaseName].join("\u001f")
    : null;
  const [frame, setFrame] = useState<AsyncResourceState<HelmReleaseDetail, HelmPortFailure>>(ASYNC_IDLE);

  useEffect(() => {
    if (request === null || identityKey === null) {
      queueMicrotask(() => setFrame(ASYNC_IDLE));
      return;
    }
    let active = true;
    queueMicrotask(() => {
      if (active) setFrame((current) => startAsyncResource(current));
    });
    const sharedRequest = acquireSharedRequest(
      port,
      `helm-release:${identityKey}:r${revision}`,
      (signal) => port.getRelease(request, signal),
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
  }, [identityKey, port, request, revision]);

  return { frame, refresh };
}

function toPortFailure(error: unknown): HelmPortFailure {
  if (error instanceof HelmPortFailure) return error;
  return new HelmPortFailure("error");
}

import { useCallback, useEffect, useMemo, useState } from "react";

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
import { useServerRefreshScheduler } from "../../shared/data/useServerRefreshScheduler";
import {
  HelmPortFailure,
  type HelmPort,
  type HelmReleaseDetail,
  type HelmReleaseDetailRequest,
  type HelmReleaseList,
} from "../../features/helm/helmContract";

export function useHelmReleaseList(
  port: HelmPort,
  clusterIds: readonly string[],
): {
  frame: AsyncResourceState<HelmReleaseList, HelmPortFailure>;
  refresh: () => void;
  refreshAfterMutation: () => void;
} {
  const [revision, setRevision] = useState(0);
  const refreshController = useServerRefreshScheduler(
    () => setRevision((current) => current + 1),
  );
  const canonicalClusterIds = useMemo(
    () => [...new Set(clusterIds)].sort(),
    [clusterIds],
  );
  const scopeKey = canonicalClusterIds.join("\u001f");
  const [frame, setFrame] = useState<AsyncResourceState<HelmReleaseList, HelmPortFailure>>(ASYNC_LOADING);

  useEffect(() => {
    refreshController.backgroundFailure();
  }, [refreshController, scopeKey]);

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
      request.release();
    };
  }, [canonicalClusterIds, port, refreshController, revision, scopeKey]);

  const refreshAfterMutation = useCallback(() => {
    if (frame.phase !== "ready") return;
    refreshController.requestMutationRefresh(frame.data.postMutationRefreshAfterSeconds);
  }, [frame, refreshController]);

  return {
    frame,
    refresh: refreshController.requestRefresh,
    refreshAfterMutation,
  };
}

export function useHelmReleaseDetail(
  port: HelmPort,
  request: HelmReleaseDetailRequest | null,
): {
  frame: AsyncResourceState<HelmReleaseDetail, HelmPortFailure>;
  refresh: () => void;
  refreshAfterMutation: () => void;
} {
  const [revision, setRevision] = useState(0);
  const refreshController = useServerRefreshScheduler(
    () => setRevision((current) => current + 1),
  );
  const identityKey = request
    ? [request.clusterId, request.namespace, request.releaseName].join("\u001f")
    : null;
  const [frame, setFrame] = useState<AsyncResourceState<HelmReleaseDetail, HelmPortFailure>>(ASYNC_IDLE);

  useEffect(() => {
    refreshController.backgroundFailure();
  }, [identityKey, refreshController]);

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
  }, [identityKey, port, refreshController, request, revision]);

  const refreshAfterMutation = useCallback(() => {
    if (frame.phase !== "ready") return;
    refreshController.requestMutationRefresh(frame.data.postMutationRefreshAfterSeconds);
  }, [frame, refreshController]);

  return {
    frame,
    refresh: refreshController.requestRefresh,
    refreshAfterMutation,
  };
}

function toPortFailure(error: unknown): HelmPortFailure {
  if (error instanceof HelmPortFailure) return error;
  return new HelmPortFailure("error");
}

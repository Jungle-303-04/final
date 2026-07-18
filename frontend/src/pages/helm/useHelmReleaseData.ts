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
  type HelmReleaseUpgradeBatch,
  type HelmReleaseUpgradeInfo,
  type HelmReleaseVersionList,
} from "../../features/helm/helmContract";

export interface HelmReleaseListView extends HelmReleaseList {
  upgrades: HelmReleaseUpgradeBatch;
}

export interface HelmReleaseDetailView extends HelmReleaseDetail {
  upgradeInfo: HelmReleaseUpgradeInfo;
  availableVersions: HelmReleaseVersionList;
}

export function useHelmReleaseList(
  port: HelmPort,
  clusterIds: readonly string[],
): {
  frame: AsyncResourceState<HelmReleaseListView, HelmPortFailure>;
  refresh: () => void;
  refreshAfterMutation: () => void;
} {
  const [revision, setRevision] = useState(0);
  const refreshController = useServerRefreshScheduler(
    () => setRevision((current) => current + 1),
  );
  const scopeKey = JSON.stringify([...new Set(clusterIds)].sort());
  const canonicalClusterIds = useMemo(
    () => JSON.parse(scopeKey) as string[],
    [scopeKey],
  );
  const [frame, setFrame] = useState<AsyncResourceState<HelmReleaseListView, HelmPortFailure>>(ASYNC_LOADING);

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
      async (signal) => {
        const scope = { clusterIds: canonicalClusterIds };
        const [releaseList, upgrades] = await Promise.all([
          port.listReleases(scope, signal),
          port.checkReleaseUpgrades(scope, signal),
        ]);
        return {
          ...releaseList,
          upgrades,
          refreshAfterSeconds: Math.min(
            releaseList.refreshAfterSeconds,
            upgrades.refreshAfterSeconds,
          ),
        };
      },
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
  frame: AsyncResourceState<HelmReleaseDetailView, HelmPortFailure>;
  refresh: () => void;
  refreshAfterMutation: () => void;
} {
  const [revision, setRevision] = useState(0);
  const refreshController = useServerRefreshScheduler(
    () => setRevision((current) => current + 1),
  );
  const identityKey = request
    ? JSON.stringify([request.clusterId, request.namespace, request.releaseName])
    : null;
  const canonicalRequest = useMemo<HelmReleaseDetailRequest | null>(() => {
    if (identityKey === null) return null;
    const [clusterId, namespace, releaseName] = JSON.parse(identityKey) as [
      string,
      string,
      string,
    ];
    return { clusterId, namespace, releaseName };
  }, [identityKey]);
  const [frame, setFrame] = useState<AsyncResourceState<HelmReleaseDetailView, HelmPortFailure>>(ASYNC_IDLE);

  useEffect(() => {
    refreshController.backgroundFailure();
  }, [identityKey, refreshController]);

  useEffect(() => {
    if (canonicalRequest === null || identityKey === null) {
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
      async (signal) => {
        const [detail, upgradeInfo, availableVersions] = await Promise.all([
          port.getRelease(canonicalRequest, signal),
          port.getReleaseUpgradeInfo(canonicalRequest, signal),
          port.listReleaseVersions(canonicalRequest, signal),
        ]);
        return {
          ...detail,
          upgradeInfo,
          availableVersions,
          refreshAfterSeconds: Math.min(
            detail.refreshAfterSeconds,
            upgradeInfo.refreshAfterSeconds,
            availableVersions.refreshAfterSeconds,
          ),
        };
      },
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
  }, [canonicalRequest, identityKey, port, refreshController, revision]);

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

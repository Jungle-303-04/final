import { useCallback, useEffect, useMemo, useRef, useState } from "react";

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
  type CostNodePage,
  type CostPort,
} from "../../features/cost/costContract";

const NODE_PAGE_LIMIT = 50;

export function useCostNodes(
  port: CostPort,
  request: { clusterIds: readonly string[]; namespaces: readonly string[] },
): {
  frame: AsyncResourceState<CostNodePage, CostPortFailure>;
  loadMore: () => Promise<void>;
  loadMoreFailure: CostPortFailure | null;
  loadingMore: boolean;
  refresh: () => void;
} {
  const scopeKey = useMemo(() => [
    [...new Set(request.clusterIds)].sort().join("\u001f"),
    [...new Set(request.namespaces)].sort().join("\u001f"),
  ].join("\u001e"), [request.clusterIds, request.namespaces]);
  const canonicalRequest = useMemo(() => {
    const [clusters = "", namespaces = ""] = scopeKey.split("\u001e");
    return {
      clusterIds: clusters ? clusters.split("\u001f") : [],
      namespaces: namespaces ? namespaces.split("\u001f") : [],
    };
  }, [scopeKey]);
  const [revision, setRevision] = useState(0);
  const [frame, setFrame] = useState<AsyncResourceState<CostNodePage, CostPortFailure>>(ASYNC_LOADING);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadMoreFailure, setLoadMoreFailure] = useState<CostPortFailure | null>(null);
  const pageControllerRef = useRef<AbortController | null>(null);
  const refreshController = useServerRefreshScheduler(
    () => setRevision((current) => current + 1),
  );

  useEffect(() => {
    let active = true;
    refreshController.backgroundFailure();
    pageControllerRef.current?.abort();
    queueMicrotask(() => {
      if (!active) return;
      setLoadingMore(false);
      setLoadMoreFailure(null);
    });
    return () => { active = false; };
  }, [refreshController, scopeKey]);

  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (active) setFrame((current) => startAsyncResource(current));
    });
    const sharedRequest = acquireSharedRequest(
      port,
      `cost-nodes:${scopeKey}:r${revision}`,
      async (signal) => {
        const [data, refreshPolicy] = await Promise.all([
          port.getNodes({ ...canonicalRequest, limit: NODE_PAGE_LIMIT }, signal),
          port.loadRefreshPolicy("nodes", signal),
        ]);
        return { data, refreshPolicy };
      },
    );
    void sharedRequest.promise.then(
      ({ data, refreshPolicy }) => {
        if (!active) return;
        setFrame(asyncResourceSuccess(data));
        refreshController.acceptSuccess(refreshPolicy);
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
  }, [canonicalRequest, port, refreshController, revision, scopeKey]);

  useEffect(() => () => pageControllerRef.current?.abort(), []);

  const loadMore = useCallback(async () => {
    if (frame.phase !== "ready" || !frame.data.hasMore || frame.data.nextCursor === null || loadingMore) {
      return;
    }
    const current = frame.data;
    const controller = new AbortController();
    pageControllerRef.current?.abort();
    pageControllerRef.current = controller;
    setLoadingMore(true);
    setLoadMoreFailure(null);
    try {
      const next = await port.getNodes({
        ...canonicalRequest,
        cursor: current.nextCursor ?? undefined,
        limit: NODE_PAGE_LIMIT,
      }, controller.signal);
      if (controller.signal.aborted) return;
      if (next.snapshotRevision !== current.snapshotRevision) {
        throw new CostPortFailure("invalid-response");
      }
      setFrame(asyncResourceSuccess(mergeNodePages(current, next)));
    } catch (error) {
      if (!isAbortError(error)) setLoadMoreFailure(toPortFailure(error));
    } finally {
      if (pageControllerRef.current === controller) pageControllerRef.current = null;
      if (!controller.signal.aborted) setLoadingMore(false);
    }
  }, [canonicalRequest, frame, loadingMore, port]);

  return {
    frame,
    loadMore,
    loadMoreFailure,
    loadingMore,
    refresh: refreshController.requestRefresh,
  };
}

function mergeNodePages(current: CostNodePage, next: CostNodePage): CostNodePage {
  const seen = new Set(current.items.map((item) => `${item.clusterId}\u001f${item.resource.uid}`));
  const additions = next.items.filter((item) => {
    const key = `${item.clusterId}\u001f${item.resource.uid}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return {
    ...next,
    items: [...current.items, ...additions],
  };
}

function toPortFailure(error: unknown): CostPortFailure {
  return error instanceof CostPortFailure ? error : new CostPortFailure("error");
}

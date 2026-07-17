import { useEffect, useState } from "react";

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
  ChecksPortFailure,
  type ChecksDetailResponse,
  type ChecksOverview,
  type ChecksPort,
  type ChecksRequest,
} from "../../features/checks/checksContract";
import type { ResourceRef } from "../../shared/parity/referenceParity";

export function useChecksOverview(
  port: ChecksPort,
  request: ChecksRequest,
): {
  frame: AsyncResourceState<ChecksOverview, ChecksPortFailure>;
  refresh: () => void;
} {
  return useChecksRequest<ChecksOverview>(port, request, null);
}

export function useChecksDetail(
  port: ChecksPort,
  checkId: string,
  request: ChecksRequest,
): {
  frame: AsyncResourceState<ChecksDetailResponse, ChecksPortFailure>;
  refresh: () => void;
} {
  return useChecksRequest<ChecksDetailResponse>(port, request, checkId);
}

function useChecksRequest<T>(
  port: ChecksPort,
  request: ChecksRequest,
  checkId: string | null,
): {
  frame: AsyncResourceState<T, ChecksPortFailure>;
  refresh: () => void;
} {
  // Scope values, rather than caller array identity, define a network request.
  // This keeps a render-created request object from restarting the poll loop.
  const scopeKey = requestScopeKey(request);
  const [revision, setRevision] = useState(0);
  const [frame, setFrame] = useState<AsyncResourceState<T, ChecksPortFailure>>(ASYNC_LOADING);
  const refreshController = useServerRefreshScheduler(
    () => setRevision((current) => current + 1),
  );

  useEffect(() => {
    refreshController.backgroundFailure();
  }, [checkId, port, refreshController, scopeKey]);

  useEffect(() => {
    let active = true;
    const canonicalRequest = requestFromScopeKey(scopeKey);
    queueMicrotask(() => {
      if (active) setFrame((current) => startAsyncResource(current));
    });
    const sharedRequest = acquireSharedRequest(
      port,
      `checks:${checkId === null ? "overview" : `detail:${checkId}`}:${scopeKey}:r${revision}`,
      async (signal) => {
        const [data, refreshPolicy] = await Promise.all([
          (checkId === null
            ? port.getOverview(canonicalRequest, signal)
            : port.getDetail(checkId, canonicalRequest, signal)) as Promise<T>,
          port.loadRefreshPolicy(signal),
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
  }, [checkId, port, refreshController, revision, scopeKey]);

  return { frame, refresh: refreshController.requestRefresh };
}

function toPortFailure(error: unknown): ChecksPortFailure {
  return error instanceof ChecksPortFailure ? error : new ChecksPortFailure("error");
}

function requestScopeKey(request: ChecksRequest): string {
  return JSON.stringify({
    clusterIds: canonicalValues(request.clusterIds),
    namespaces: canonicalValues(request.namespaces),
    resource: canonicalResource(request.resource),
  });
}

function requestFromScopeKey(scopeKey: string): ChecksRequest {
  const value = JSON.parse(scopeKey) as {
    clusterIds: string[];
    namespaces: string[];
    resource: ResourceRef | null;
  };
  return {
    clusterIds: value.clusterIds,
    namespaces: value.namespaces,
    ...(value.resource === null ? {} : { resource: value.resource }),
  };
}

function canonicalResource(resource: ResourceRef | undefined): ResourceRef | null {
  if (resource === undefined) return null;
  return {
    apiGroup: resource.apiGroup ?? "",
    version: resource.version ?? "",
    kind: resource.kind,
    namespace: resource.namespace,
    name: resource.name,
    uid: resource.uid,
  };
}

function canonicalValues(values: readonly string[]): string[] {
  return [...new Set(values)].sort();
}

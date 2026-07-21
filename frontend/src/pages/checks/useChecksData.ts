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
import { useVisibleRefreshClock } from "../../shared/data/useVisibleRefreshClock";
import {
  ChecksPortFailure,
  type ChecksDetailResponse,
  type ChecksOverview,
  type ChecksPort,
  type ChecksRequest,
} from "../../features/checks/checksContract";

const CHECKS_SCOPE_REFRESH_INTERVAL_MS = 60_000;

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
  const { refresh, revision } = useVisibleRefreshClock(true, CHECKS_SCOPE_REFRESH_INTERVAL_MS);
  // Scope values, rather than caller array identity, define a network request.
  // This keeps a render-created request object from restarting the poll loop.
  const scopeKey = requestScopeKey(request);
  const [frame, setFrame] = useState<AsyncResourceState<T, ChecksPortFailure>>(ASYNC_LOADING);

  useEffect(() => {
    let active = true;
    const canonicalRequest = requestFromScopeKey(scopeKey);
    queueMicrotask(() => {
      if (active) setFrame((current) => startAsyncResource(current));
    });
    const sharedRequest = acquireSharedRequest(
      port,
      `checks:${checkId === null ? "overview" : `detail:${checkId}`}:${scopeKey}:r${revision}`,
      (signal) => (checkId === null
        ? port.getOverview(canonicalRequest, signal)
        : port.getDetail(checkId, canonicalRequest, signal)) as Promise<T>,
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
  }, [checkId, port, revision, scopeKey]);

  return { frame, refresh };
}

function toPortFailure(error: unknown): ChecksPortFailure {
  return error instanceof ChecksPortFailure ? error : new ChecksPortFailure("error");
}

function requestScopeKey(request: ChecksRequest): string {
  return JSON.stringify({
    clusterIds: canonicalValues(request.clusterIds),
    namespaces: canonicalValues(request.namespaces),
  });
}

function requestFromScopeKey(scopeKey: string): ChecksRequest {
  const value = JSON.parse(scopeKey) as {
    clusterIds: string[];
    namespaces: string[];
  };
  return {
    clusterIds: value.clusterIds,
    namespaces: value.namespaces,
  };
}

function canonicalValues(values: readonly string[]): string[] {
  return [...new Set(values)].sort();
}

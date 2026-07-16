import { useCallback, useEffect, useState } from "react";

import { useAuthSessionGate } from "../../features/auth/AuthSessionGate";
import {
  ComparePortFailure,
  type ComparePort,
  type CompareRequest,
  type CompareResult,
} from "../../features/compare/compareContract";
import { acquireSharedRequest } from "../../shared/data/sharedRequest";

export type CompareFrame =
  | { phase: "loading"; data: null; failure: null }
  | { phase: "ready"; data: CompareResult; failure: null; refreshing: boolean }
  | { phase: "failed"; data: null; failure: ComparePortFailure };

interface CompareRecord {
  requestKey: string | null;
  frame: CompareFrame;
}

export function useCompare(
  port: ComparePort,
  request: CompareRequest | null,
): { frame: CompareFrame; refresh: () => void } {
  const { reportUnauthorized } = useAuthSessionGate();
  const [revision, setRevision] = useState(0);
  const [record, setRecord] = useState<CompareRecord>({
    requestKey: null,
    frame: { phase: "loading", data: null, failure: null },
  });
  const refresh = useCallback(() => setRevision((current) => current + 1), []);
  const key = request === null ? null : [
    request.clusterId,
    request.kind.toLocaleLowerCase(),
    request.apiGroup,
    request.apiVersion ?? "_",
    request.a.namespace ?? "_",
    request.a.name,
    request.b.namespace ?? "_",
    request.b.name,
  ].join("|");

  const requestKey = key === null ? null : `${key}:r${revision}`;
  const frame: CompareFrame = requestKey !== null && record.requestKey === requestKey
    ? record.frame
    : { phase: "loading", data: null, failure: null };

  useEffect(() => {
    if (request === null || key === null) {
      return;
    }
    let active = true;
    queueMicrotask(() => {
      if (active) setRecord({ requestKey, frame: { phase: "loading", data: null, failure: null } });
    });
    const shared = acquireSharedRequest(
      port,
      `compare:${requestKey}`,
      (signal) => port.getComparison(request, signal),
    );
    void shared.promise.then(
      (data) => {
        if (active) setRecord({ requestKey, frame: { phase: "ready", data, failure: null, refreshing: false } });
      },
      (error: unknown) => {
        if (!active || isAbortError(error)) return;
        const failure = error instanceof ComparePortFailure ? error : new ComparePortFailure("error");
        if (failure.code === "unauthorized") reportUnauthorized();
        if (active) setRecord({ requestKey, frame: { phase: "failed", data: null, failure } });
      },
    );
    return () => {
      active = false;
      shared.release();
    };
  }, [key, port, reportUnauthorized, request, requestKey]);

  const visibleFrame = request === null || key === null
    ? { phase: "failed", data: null, failure: new ComparePortFailure("invalid-request") } as const
    : frame;
  return { frame: visibleFrame, refresh };
}

function isAbortError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "name" in error && error.name === "AbortError";
}

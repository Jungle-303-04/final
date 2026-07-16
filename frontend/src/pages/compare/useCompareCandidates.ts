import { useCallback, useEffect, useState } from "react";

import { useAuthSessionGate } from "../../features/auth/AuthSessionGate";
import {
  ComparePortFailure,
  type CompareCandidates,
  type CompareIdentityRequest,
  type ComparePort,
} from "../../features/compare/compareContract";
import { acquireSharedRequest } from "../../shared/data/sharedRequest";

export type CompareCandidatesFrame =
  | { phase: "idle" | "loading"; data: null; failure: null }
  | { phase: "ready"; data: CompareCandidates; failure: null }
  | { phase: "failed"; data: null; failure: ComparePortFailure };

interface CompareCandidatesRecord {
  requestKey: string | null;
  frame: CompareCandidatesFrame;
}

export function useCompareCandidates(
  port: ComparePort,
  request: CompareIdentityRequest | null,
  enabled: boolean,
): { frame: CompareCandidatesFrame; retry: () => void } {
  const { reportUnauthorized } = useAuthSessionGate();
  const [revision, setRevision] = useState(0);
  const [record, setRecord] = useState<CompareCandidatesRecord>({
    requestKey: null,
    frame: { phase: "idle", data: null, failure: null },
  });
  const retry = useCallback(() => setRevision((current) => current + 1), []);
  const key = request === null ? null : [
    request.clusterId,
    request.kind.toLocaleLowerCase(),
    request.apiGroup,
    request.apiVersion ?? "_",
  ].join("|");

  const requestKey = key === null ? null : `${key}:r${revision}`;
  const frame: CompareCandidatesFrame = requestKey !== null && record.requestKey === requestKey
    ? record.frame
    : { phase: "loading", data: null, failure: null };

  useEffect(() => {
    if (!enabled) {
      return;
    }
    if (request === null || key === null) {
      return;
    }
    let active = true;
    queueMicrotask(() => {
      if (active) setRecord({ requestKey, frame: { phase: "loading", data: null, failure: null } });
    });
    const shared = acquireSharedRequest(
      port,
      `compare-candidates:${requestKey}`,
      (signal) => port.getCandidates(request, signal),
    );
    void shared.promise.then(
      (data) => {
        if (active) setRecord({ requestKey, frame: { phase: "ready", data, failure: null } });
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
  }, [enabled, key, port, reportUnauthorized, request, requestKey]);

  const visibleFrame = !enabled
    ? { phase: "idle", data: null, failure: null } as const
    : request === null || key === null
      ? { phase: "failed", data: null, failure: new ComparePortFailure("invalid-request") } as const
      : frame;
  return { frame: visibleFrame, retry };
}

function isAbortError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "name" in error && error.name === "AbortError";
}

import { useCallback, useEffect, useState } from "react";

import { useAuthSessionGate } from "../../features/auth/AuthSessionGate";
import {
  WorkloadDetailPortFailure,
  type WorkloadDetail,
  type WorkloadDetailPort,
  type WorkloadDetailRequest,
} from "../../features/workload-detail/workloadDetailContract";
import { acquireSharedRequest } from "../../shared/data/sharedRequest";

export type WorkloadDetailFrame =
  | { phase: "loading"; data: null; failure: null }
  | { phase: "ready"; data: WorkloadDetail; failure: null; refreshing: boolean }
  | { phase: "failed"; data: null; failure: WorkloadDetailPortFailure };

export function useWorkloadDetail(
  port: WorkloadDetailPort,
  request: WorkloadDetailRequest | null,
): { frame: WorkloadDetailFrame; refresh: () => void } {
  const { reportUnauthorized } = useAuthSessionGate();
  const [revision, setRevision] = useState(0);
  const [frame, setFrame] = useState<WorkloadDetailFrame>({ phase: "loading", data: null, failure: null });
  const refresh = useCallback(() => setRevision((current) => current + 1), []);
  const key = request === null ? null : [
    request.clusterId,
    request.apiGroup,
    request.apiVersion,
    request.kind.toLowerCase(),
    request.namespace ?? "_",
    request.name,
  ].join("|");

  useEffect(() => {
    if (request === null || key === null) {
      setFrame({ phase: "failed", data: null, failure: new WorkloadDetailPortFailure("invalid-request") });
      return;
    }
    let active = true;
    setFrame((current) => current.phase === "ready"
      ? { phase: "ready", data: current.data, failure: null, refreshing: true }
      : { phase: "loading", data: null, failure: null });
    const shared = acquireSharedRequest(
      port,
      `workload-detail:${key}:r${revision}`,
      (signal) => port.getDetail(request, signal),
    );
    void shared.promise.then(
      (data) => {
        if (active) setFrame({ phase: "ready", data, failure: null, refreshing: false });
      },
      (error: unknown) => {
        if (!active || isAbortError(error)) return;
        const failure = error instanceof WorkloadDetailPortFailure
          ? error
          : new WorkloadDetailPortFailure("error");
        if (failure.code === "unauthorized") reportUnauthorized();
        if (active) setFrame({ phase: "failed", data: null, failure });
      },
    );
    return () => {
      active = false;
      shared.release();
    };
  }, [key, port, reportUnauthorized, request, revision]);

  return { frame, refresh };
}

function isAbortError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "name" in error && error.name === "AbortError";
}

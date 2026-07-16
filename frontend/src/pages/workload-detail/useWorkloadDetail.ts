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

const INVALID_REQUEST_FRAME: WorkloadDetailFrame = {
  phase: "failed",
  data: null,
  failure: new WorkloadDetailPortFailure("invalid-request"),
};

const LOADING_FRAME: WorkloadDetailFrame = { phase: "loading", data: null, failure: null };

type SettledWorkloadDetailFrame =
  | {
    phase: "ready";
    data: WorkloadDetail;
    key: string;
    port: WorkloadDetailPort;
    revision: number;
  }
  | {
    phase: "failed";
    failure: WorkloadDetailPortFailure;
    key: string;
    port: WorkloadDetailPort;
    revision: number;
  }
  | null;

export function useWorkloadDetail(
  port: WorkloadDetailPort,
  request: WorkloadDetailRequest | null,
): { frame: WorkloadDetailFrame; refresh: () => void } {
  const { reportUnauthorized } = useAuthSessionGate();
  const [revision, setRevision] = useState(0);
  const [settled, setSettled] = useState<SettledWorkloadDetailFrame>(null);
  const refresh = useCallback(() => setRevision((current) => current + 1), []);
  const key = request === null ? null : [
    request.clusterId,
    request.apiGroup,
    request.apiVersion,
    request.kind.toLowerCase(),
    request.namespace ?? "_",
    request.name,
  ].join("|");
  const invalidRequest = request === null || key === null;

  useEffect(() => {
    if (invalidRequest || request === null || key === null) return;
    let active = true;
    const shared = acquireSharedRequest(
      port,
      `workload-detail:${key}:r${revision}`,
      (signal) => port.getDetail(request, signal),
    );
    void shared.promise.then(
      (data) => {
        if (active) setSettled({ phase: "ready", data, key, port, revision });
      },
      (error: unknown) => {
        if (!active || isAbortError(error)) return;
        const failure = error instanceof WorkloadDetailPortFailure
          ? error
          : new WorkloadDetailPortFailure("error");
        if (failure.code === "unauthorized") reportUnauthorized();
        if (active) setSettled({ phase: "failed", failure, key, port, revision });
      },
    );
    return () => {
      active = false;
      shared.release();
    };
  }, [invalidRequest, key, port, reportUnauthorized, request, revision]);

  return {
    frame: invalidRequest
      ? INVALID_REQUEST_FRAME
      : visibleFrame(settled, key, port, revision),
    refresh,
  };
}

function visibleFrame(
  settled: SettledWorkloadDetailFrame,
  key: string | null,
  port: WorkloadDetailPort,
  revision: number,
): WorkloadDetailFrame {
  if (settled === null || settled.key !== key || settled.port !== port) {
    return LOADING_FRAME;
  }
  if (settled.revision !== revision) {
    return settled.phase === "ready"
      ? { phase: "ready", data: settled.data, failure: null, refreshing: true }
      : LOADING_FRAME;
  }
  return settled.phase === "ready"
    ? { phase: "ready", data: settled.data, failure: null, refreshing: false }
    : { phase: "failed", data: null, failure: settled.failure };
}

function isAbortError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "name" in error && error.name === "AbortError";
}

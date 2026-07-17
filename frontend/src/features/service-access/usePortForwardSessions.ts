import { useCallback, useEffect, useRef, useState } from "react";

import type {
  PortForwardSessionPort,
  PortForwardSessionSnapshot,
} from "./portForwardSessionContract";
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

export interface PortForwardSessionsController {
  available: boolean;
  frame: AsyncResourceState<PortForwardSessionSnapshot, Error>;
  refresh: () => void;
  refreshAfterMutation: () => void;
  stop: (sessionId: string) => Promise<void>;
  recreate: (sessionId: string) => Promise<void>;
  stoppingId: string | null;
  recreatingId: string | null;
  stopFailure: Error | null;
  mutationFailureKind: "stop" | "recreate" | null;
}

export function usePortForwardSessions(
  port: PortForwardSessionPort,
): PortForwardSessionsController {
  const [revision, setRevision] = useState(0);
  const [frame, setFrame] = useState<AsyncResourceState<PortForwardSessionSnapshot, Error>>(
    port.available ? ASYNC_LOADING : ASYNC_IDLE,
  );
  const [stoppingId, setStoppingId] = useState<string | null>(null);
  const [recreatingId, setRecreatingId] = useState<string | null>(null);
  const [stopFailure, setStopFailure] = useState<Error | null>(null);
  const [mutationFailureKind, setMutationFailureKind] = useState<"stop" | "recreate" | null>(null);
  const stopController = useRef<AbortController | null>(null);
  const refreshController = useServerRefreshScheduler(
    () => setRevision((current) => current + 1),
  );

  useEffect(() => {
    if (!port.available) {
      queueMicrotask(() => setFrame(ASYNC_IDLE));
      return;
    }
    let active = true;
    queueMicrotask(() => {
      if (active) setFrame((current) => startAsyncResource(current));
    });
    const request = acquireSharedRequest(
      port,
      `port-forward-sessions:r${revision}`,
      (signal) => port.list(signal),
    );
    void request.promise.then(
      (data) => {
        if (!active) return;
        setFrame(asyncResourceSuccess(data));
        refreshController.acceptSuccess(data.refreshPolicy);
      },
      (error: unknown) => {
        if (!active || isAbortError(error)) return;
        refreshController.backgroundFailure();
        setFrame((current) => asyncResourceFailure(current, toError(error)));
      },
    );
    return () => {
      active = false;
      request.release();
    };
  }, [port, refreshController, revision]);

  useEffect(() => () => {
    const controller = stopController.current;
    stopController.current = null;
    controller?.abort();
  }, []);

  const refreshAfterMutation = useCallback(() => {
    if (frame.phase !== "ready") {
      refreshController.requestRefresh();
      return;
    }
    refreshController.requestMutationRefresh(
      requiredMutationDelay(frame.data.refreshPolicy.postMutationRefreshAfterSeconds),
    );
  }, [frame, refreshController]);

  const stop = useCallback(async (sessionId: string) => {
    if (frame.phase !== "ready" || stoppingId !== null || recreatingId !== null) return;
    const controller = new AbortController();
    stopController.current = controller;
    setStoppingId(sessionId);
    setStopFailure(null);
    setMutationFailureKind(null);
    try {
      await port.stop(sessionId, controller.signal);
      refreshAfterMutation();
    } catch (error) {
      if (!isAbortError(error)) {
        setStopFailure(toError(error));
        setMutationFailureKind("stop");
      }
    } finally {
      if (stopController.current === controller) {
        stopController.current = null;
        setStoppingId(null);
      }
    }
  }, [frame, port, recreatingId, refreshAfterMutation, stoppingId]);

  const recreate = useCallback(async (sessionId: string) => {
    if (frame.phase !== "ready" || stoppingId !== null || recreatingId !== null) return;
    const controller = new AbortController();
    stopController.current = controller;
    setRecreatingId(sessionId);
    setStopFailure(null);
    setMutationFailureKind(null);
    try {
      await port.recreate(sessionId, controller.signal);
      refreshAfterMutation();
    } catch (error) {
      if (!isAbortError(error)) {
        setStopFailure(toError(error));
        setMutationFailureKind("recreate");
      }
    } finally {
      if (stopController.current === controller) {
        stopController.current = null;
        setRecreatingId(null);
      }
    }
  }, [frame, port, recreatingId, refreshAfterMutation, stoppingId]);

  return {
    available: port.available,
    frame,
    refresh: refreshController.requestRefresh,
    refreshAfterMutation,
    stop,
    recreate,
    stoppingId,
    recreatingId,
    stopFailure,
    mutationFailureKind,
  };
}

function requiredMutationDelay(value: number | null): number {
  if (value === null) throw new TypeError("port session mutation refresh policy is unavailable");
  return value;
}

function toError(value: unknown): Error {
  return value instanceof Error ? value : new Error("port-forward session operation failed");
}

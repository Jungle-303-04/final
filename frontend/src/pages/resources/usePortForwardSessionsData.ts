import { useCallback, useEffect, useRef, useState } from "react";

import type {
  PortForwardSessionPort,
  PortForwardSessionSnapshot,
} from "../../features/service-access/portForwardSessionContract";
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

export function usePortForwardSessions(port: PortForwardSessionPort): {
  frame: AsyncResourceState<PortForwardSessionSnapshot, Error>;
  refresh: () => void;
  stop: (sessionId: string) => Promise<void>;
  stoppingId: string | null;
  stopFailure: Error | null;
} {
  const [revision, setRevision] = useState(0);
  const [frame, setFrame] = useState<AsyncResourceState<PortForwardSessionSnapshot, Error>>(
    port.available ? ASYNC_LOADING : ASYNC_IDLE,
  );
  const [stoppingId, setStoppingId] = useState<string | null>(null);
  const [stopFailure, setStopFailure] = useState<Error | null>(null);
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

  const stop = useCallback(async (sessionId: string) => {
    if (frame.phase !== "ready" || stoppingId !== null) return;
    const controller = new AbortController();
    stopController.current = controller;
    setStoppingId(sessionId);
    setStopFailure(null);
    try {
      await port.stop(sessionId, controller.signal);
      refreshController.requestMutationRefresh(
        requiredMutationDelay(frame.data.refreshPolicy.postMutationRefreshAfterSeconds),
      );
    } catch (error) {
      if (!isAbortError(error)) setStopFailure(toError(error));
    } finally {
      if (stopController.current === controller) {
        stopController.current = null;
        setStoppingId(null);
      }
    }
  }, [frame, port, refreshController, stoppingId]);

  return {
    frame,
    refresh: refreshController.requestRefresh,
    stop,
    stoppingId,
    stopFailure,
  };
}

function requiredMutationDelay(value: number | null): number {
  if (value === null) throw new TypeError("port session mutation refresh policy is unavailable");
  return value;
}

function toError(value: unknown): Error {
  return value instanceof Error ? value : new Error("port-forward session operation failed");
}

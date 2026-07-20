import { useCallback, useEffect, useEffectEvent, useState } from "react";

import { acquireSharedRequest } from "../../shared/data/sharedRequest";

export type HomeBoardResource<T> =
  | { phase: "loading" }
  | { phase: "failed"; retry: () => void }
  | {
      data: T;
      phase: "ready";
      refreshFailed: boolean;
      refreshing: boolean;
      retry: () => void;
    };

export interface HomeBoardRequestIdentity {
  key: string;
  owner: object;
}

export function useHomeBoardResource<T>(
  load: (signal: AbortSignal) => Promise<T>,
  requestIdentity: HomeBoardRequestIdentity,
): HomeBoardResource<T> {
  const runLoad = useEffectEvent(load);
  const [retryRevision, setRetryRevision] = useState(0);
  const retry = useCallback(() => setRetryRevision((current) => current + 1), []);
  const [state, setState] = useState<HomeBoardResource<T>>({ phase: "loading" });
  useEffect(() => {
    let active = true;
    const request = acquireSharedRequest(
      requestIdentity.owner,
      `${requestIdentity.key}:retry:${retryRevision}`,
      (signal) => runLoad(signal),
    );
    queueMicrotask(() => {
      if (!active) return;
      setState((current) => current.phase === "ready"
        ? { ...current, refreshFailed: false, refreshing: true }
        : { phase: "loading" });
    });
    void request.promise.then(
      (data) => {
        if (active) {
          setState({
            data,
            phase: "ready",
            refreshFailed: false,
            refreshing: false,
            retry,
          });
        }
      },
      (error: unknown) => {
        if (!active || isAbortError(error)) return;
        setState((current) => current.phase === "ready"
          ? { ...current, refreshFailed: true, refreshing: false }
          : { phase: "failed", retry });
      },
    );
    return () => {
      active = false;
      request.release();
    };
  }, [
    requestIdentity.key,
    requestIdentity.owner,
    retry,
    retryRevision,
  ]);
  return state;
}

function isAbortError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "name" in error &&
    error.name === "AbortError";
}

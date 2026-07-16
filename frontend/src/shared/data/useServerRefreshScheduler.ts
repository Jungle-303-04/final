import { useCallback, useEffect, useMemo, useRef } from "react";

import {
  createServerRefreshScheduler,
  type ServerDeclaredRefreshPolicy,
  type ServerRefreshCompletion,
  type ServerRefreshScheduler,
} from "./serverRefreshScheduler";

export interface ServerRefreshController {
  acceptSuccess(policy: ServerDeclaredRefreshPolicy, completion?: ServerRefreshCompletion): void;
  backgroundFailure(): void;
  requestEventInvalidation(): void;
  requestRefresh(): void;
  requestMutationRefresh(followUpAfterSeconds: number): void;
}

/**
 * React lifecycle adapter for the shared server-owned refresh scheduler.
 *
 * Domain hooks acknowledge only validated successful responses.  The
 * scheduler then emits at most one visible-tab refresh and waits for the next
 * success before it can schedule again.
 */
export function useServerRefreshScheduler(
  onEligibleRefresh: () => void,
): ServerRefreshController {
  const callbackRef = useRef(onEligibleRefresh);
  const mutationFollowUpRef = useRef<number | null>(null);
  const schedulerRef = useRef<ServerRefreshScheduler | null>(null);

  useEffect(() => {
    callbackRef.current = onEligibleRefresh;
  }, [onEligibleRefresh]);

  useEffect(() => {
    const scheduler = createServerRefreshScheduler({
      onEligibleRefresh: () => callbackRef.current(),
    });
    schedulerRef.current = scheduler;
    return () => {
      scheduler.dispose();
      schedulerRef.current = null;
    };
  }, []);

  const acceptSuccess = useCallback((
    policy: ServerDeclaredRefreshPolicy,
    completion?: ServerRefreshCompletion,
  ) => {
    const followUpAfterSeconds = mutationFollowUpRef.current;
    mutationFollowUpRef.current = null;
    schedulerRef.current?.complete(
      followUpAfterSeconds === null
        ? policy
        : { refreshAfterSeconds: followUpAfterSeconds },
      completion,
    );
  }, []);
  const backgroundFailure = useCallback(() => {
    mutationFollowUpRef.current = null;
    schedulerRef.current?.backgroundFailure();
  }, []);
  const requestRefresh = useCallback(() => {
    mutationFollowUpRef.current = null;
    schedulerRef.current?.backgroundFailure();
    callbackRef.current();
  }, []);
  const requestEventInvalidation = useCallback(() => {
    schedulerRef.current?.invalidate();
  }, []);
  const requestMutationRefresh = useCallback((followUpAfterSeconds: number) => {
    if (!Number.isFinite(followUpAfterSeconds) || followUpAfterSeconds <= 0) {
      throw new RangeError("server mutation follow-up interval must be positive and finite");
    }
    mutationFollowUpRef.current = followUpAfterSeconds;
    schedulerRef.current?.backgroundFailure();
    callbackRef.current();
  }, []);

  return useMemo(
    () => ({
      acceptSuccess,
      backgroundFailure,
      requestEventInvalidation,
      requestMutationRefresh,
      requestRefresh,
    }),
    [
      acceptSuccess,
      backgroundFailure,
      requestEventInvalidation,
      requestMutationRefresh,
      requestRefresh,
    ],
  );
}

import { useCallback, useEffect, useMemo, useRef } from "react";

import {
  createServerRefreshScheduler,
  type ServerDeclaredRefreshPolicy,
  type ServerRefreshScheduler,
} from "./serverRefreshScheduler";

export interface ServerRefreshController {
  acceptSuccess(policy: ServerDeclaredRefreshPolicy): void;
  backgroundFailure(): void;
  requestRefresh(): void;
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

  const acceptSuccess = useCallback((policy: ServerDeclaredRefreshPolicy) => {
    schedulerRef.current?.complete(policy);
  }, []);
  const backgroundFailure = useCallback(() => {
    schedulerRef.current?.backgroundFailure();
  }, []);
  const requestRefresh = useCallback(() => {
    schedulerRef.current?.backgroundFailure();
    callbackRef.current();
  }, []);

  return useMemo(
    () => ({ acceptSuccess, backgroundFailure, requestRefresh }),
    [acceptSuccess, backgroundFailure, requestRefresh],
  );
}

import { useCallback, useEffect, useRef, useState } from "react";

const SUCCESS_DISPLAY_DURATION_MS = 1_200;

/**
 * A manual refresh may either return its request promise or merely start a
 * separate data frame. The latter is not a successful refresh until a newer
 * freshness observation arrives, so it never earns a success indicator by
 * returning `void` alone.
 */
export type RefreshPhase = "idle" | "pending" | "succeeded" | "failed" | "cancelled";

export interface RefreshObservation {
  /** Monotonic freshness evidence supplied by the owning data frame. */
  dataUpdatedAt?: number;
  /** True while the owning data frame is actively refreshing. */
  isFetching?: boolean;
  /** A verified refresh failure from the owning data frame. */
  hasFailed?: boolean;
}

interface RefreshAttempt {
  callbackKind: "promise" | "void";
  callbackSucceeded: boolean;
  freshnessBaseline: number | null;
  id: number;
}

export function useRefreshAnimation(
  refreshFn: () => void | Promise<unknown>,
  observation: RefreshObservation = {},
) {
  const [phase, setPhase] = useState<RefreshPhase>("idle");
  const refreshFnRef = useRef(refreshFn);
  const observationRef = useRef(observation);
  const attemptRef = useRef<RefreshAttempt | null>(null);
  const nextAttemptIdRef = useRef(0);
  const successTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    refreshFnRef.current = refreshFn;
  }, [refreshFn]);

  useEffect(() => {
    observationRef.current = observation;
  }, [observation]);

  const clearSuccessTimer = useCallback(() => {
    if (successTimerRef.current !== null) clearTimeout(successTimerRef.current);
    successTimerRef.current = null;
  }, []);

  const settle = useCallback((attemptId: number, nextPhase: RefreshPhase) => {
    if (attemptRef.current?.id !== attemptId) return;
    clearSuccessTimer();
    attemptRef.current = null;
    setPhase(nextPhase);
    if (nextPhase === "succeeded") {
      successTimerRef.current = setTimeout(() => {
        successTimerRef.current = null;
        setPhase("idle");
      }, SUCCESS_DISPLAY_DURATION_MS);
    }
  }, [clearSuccessTimer]);

  useEffect(() => {
    return () => clearSuccessTimer();
  }, [clearSuccessTimer]);

  const reconcile = useCallback((attempt: RefreshAttempt) => {
    const latest = observationRef.current;
    if (latest.hasFailed) {
      settle(attempt.id, "failed");
      return;
    }
    const observedAt = validFreshness(latest.dataUpdatedAt);
    if (attempt.freshnessBaseline !== null) {
      if (
        attempt.callbackSucceeded
        && !latest.isFetching
        && observedAt !== null
        && observedAt > attempt.freshnessBaseline
      ) {
        settle(attempt.id, "succeeded");
      }
      return;
    }
    if (!attempt.callbackSucceeded) return;
    // A returned promise is direct completion evidence. A void callback has
    // only requested a refresh and is deliberately not presented as success.
    settle(attempt.id, attempt.callbackKind === "promise" ? "succeeded" : "idle");
  }, [settle]);

  useEffect(() => {
    const attempt = attemptRef.current;
    if (phase !== "pending" || attempt === null) return;
    reconcile(attempt);
  }, [observation.dataUpdatedAt, observation.hasFailed, observation.isFetching, phase, reconcile]);

  const refresh = useCallback(() => {
    clearSuccessTimer();
    const attempt: RefreshAttempt = {
      callbackKind: "void",
      callbackSucceeded: false,
      freshnessBaseline: validFreshness(observation.dataUpdatedAt),
      id: nextAttemptIdRef.current + 1,
    };
    nextAttemptIdRef.current = attempt.id;
    attemptRef.current = attempt;
    setPhase("pending");
    try {
      const result = refreshFnRef.current();
      if (!isPromiseLike(result)) {
        attempt.callbackSucceeded = true;
        reconcile(attempt);
        return;
      }
      attempt.callbackKind = "promise";
      void Promise.resolve(result).then(
        () => {
          if (attemptRef.current?.id !== attempt.id) return;
          attempt.callbackSucceeded = true;
          reconcile(attempt);
        },
        (error: unknown) => settle(attempt.id, isAbortError(error) ? "cancelled" : "failed"),
      );
    } catch (error) {
      settle(attempt.id, isAbortError(error) ? "cancelled" : "failed");
    }
  }, [clearSuccessTimer, observation.dataUpdatedAt, reconcile, settle]);

  return { active: phase === "pending", phase, refresh };
}

function validFreshness(value: number | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
}

function isPromiseLike(value: unknown): value is Promise<unknown> {
  return typeof value === "object" && value !== null && "then" in value
    && typeof value.then === "function";
}

function isAbortError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "name" in error
    && error.name === "AbortError";
}

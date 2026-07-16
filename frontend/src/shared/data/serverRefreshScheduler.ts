/**
 * Schedules a read refresh only after a server-validated successful response.
 *
 * Product routes own fetching and retain their last successful data on a
 * background error. This scheduler owns no endpoint, query name, default
 * cadence, or retry behavior; it only turns a response-provided interval into
 * one visible-tab refresh eligibility signal.
 */

export interface ServerDeclaredRefreshPolicy {
  refreshAfterSeconds: number;
}

export interface ServerRefreshSchedulerRuntime {
  clearTimer(timer: number): void;
  isVisible(): boolean;
  setTimer(callback: () => void, delayMs: number): number;
  subscribeVisibilityChange(listener: () => void): () => void;
}

export interface ServerRefreshSchedulerOptions {
  /** Starts one route-owned fetch. The route must call complete() only on success. */
  onEligibleRefresh(): void;
  runtime?: Partial<ServerRefreshSchedulerRuntime>;
  signal?: AbortSignal;
}

export interface ServerRefreshScheduler {
  /**
   * Arms the next automatic refresh after the caller has accepted a server
   * response. Replacing a policy always replaces the pending timer.
   */
  complete(policy: ServerDeclaredRefreshPolicy): boolean;
  /**
   * Stops automatic refresh after a background failure. The caller keeps its
   * last successful resource state and may later restart this scheduler only
   * through another successful response.
   */
  backgroundFailure(): void;
  /** Coalesces server-event invalidations behind the current successful read. */
  invalidate(): void;
  dispose(): void;
  isDisposed(): boolean;
  isRefreshInFlight(): boolean;
}

const browserRuntime: ServerRefreshSchedulerRuntime = {
  clearTimer(timer) {
    clearTimeout(timer);
  },
  isVisible() {
    return typeof document === "undefined" || document.visibilityState !== "hidden";
  },
  setTimer(callback, delayMs) {
    return setTimeout(callback, delayMs) as unknown as number;
  },
  subscribeVisibilityChange(listener) {
    if (typeof document === "undefined") return () => undefined;
    document.addEventListener("visibilitychange", listener);
    return () => document.removeEventListener("visibilitychange", listener);
  },
};

export function createServerRefreshScheduler(
  options: ServerRefreshSchedulerOptions,
): ServerRefreshScheduler {
  const overrides = options.runtime;
  const runtime: ServerRefreshSchedulerRuntime = {
    clearTimer: (timer) => (overrides?.clearTimer ?? browserRuntime.clearTimer).call(overrides, timer),
    isVisible: () => (overrides?.isVisible ?? browserRuntime.isVisible).call(overrides),
    setTimer: (callback, delayMs) => (
      overrides?.setTimer ?? browserRuntime.setTimer
    ).call(overrides, callback, delayMs),
    subscribeVisibilityChange: (listener) => (
      overrides?.subscribeVisibilityChange ?? browserRuntime.subscribeVisibilityChange
    ).call(overrides, listener),
  };
  let disposed = false;
  let refreshInFlight = false;
  let hasSuccessfulResponse = false;
  let policy: ServerDeclaredRefreshPolicy | null = null;
  let timer: number | null = null;

  const unsubscribeVisibility = runtime.subscribeVisibilityChange(() => {
    if (disposed) return;
    if (!runtime.isVisible()) {
      clearTimer();
      return;
    }
    // A visible-tab return receives exactly one eligibility signal. It does
    // not reuse hidden elapsed time or invent a second browser cadence.
    if (hasSuccessfulResponse && !refreshInFlight) makeEligible();
  });
  const abort = () => dispose();
  options.signal?.addEventListener("abort", abort, { once: true });
  if (options.signal?.aborted) dispose();

  return {
    complete,
    backgroundFailure,
    invalidate: makeEligible,
    dispose,
    isDisposed: () => disposed,
    isRefreshInFlight: () => refreshInFlight,
  };

  function complete(nextPolicy: ServerDeclaredRefreshPolicy): boolean {
    if (disposed) return false;
    validatePolicy(nextPolicy);
    clearTimer();
    policy = { refreshAfterSeconds: nextPolicy.refreshAfterSeconds };
    hasSuccessfulResponse = true;
    refreshInFlight = false;
    schedule();
    return true;
  }

  function backgroundFailure(): void {
    if (disposed) return;
    clearTimer();
    refreshInFlight = false;
    // Keep the fact that a last success exists for the caller's UI, but do not
    // start a retry loop. A future explicit successful response re-arms us.
    hasSuccessfulResponse = false;
    policy = null;
  }

  function dispose(): void {
    if (disposed) return;
    disposed = true;
    clearTimer();
    policy = null;
    options.signal?.removeEventListener("abort", abort);
    unsubscribeVisibility();
  }

  function schedule(): void {
    if (disposed || refreshInFlight || policy === null || !runtime.isVisible()) return;
    clearTimer();
    timer = runtime.setTimer(() => {
      timer = null;
      if (disposed || !runtime.isVisible()) return;
      makeEligible();
    }, milliseconds(policy));
  }

  function makeEligible(): void {
    if (disposed || refreshInFlight || !hasSuccessfulResponse || !runtime.isVisible()) return;
    clearTimer();
    refreshInFlight = true;
    options.onEligibleRefresh();
  }

  function clearTimer(): void {
    if (timer === null) return;
    runtime.clearTimer(timer);
    timer = null;
  }
}

function validatePolicy(policy: ServerDeclaredRefreshPolicy): void {
  if (!Number.isFinite(policy.refreshAfterSeconds) || policy.refreshAfterSeconds <= 0) {
    throw new RangeError("server refresh interval must be a positive finite number");
  }
}

function milliseconds(policy: ServerDeclaredRefreshPolicy): number {
  return policy.refreshAfterSeconds * 1_000;
}

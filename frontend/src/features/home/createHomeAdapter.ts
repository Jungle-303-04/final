import { HomePortFailure, type HomeFailureCode, type HomePort } from "./homeContract";
import {
  toClusterChoices,
  toClusterOverview,
  toHomeInsights,
  toNodeCollection,
  toPodCollection,
} from "./homeCanonical";
import type {
  HomeEndpointDashboardEvent,
  HomeEndpointDependencies,
} from "./homeEndpointContract";
import type {
  ClusterScope,
  ScopeTransitionOperationEvent,
} from "../../shared/parity/referenceParity";
import { isHomeCanonicalError } from "./homeValidation";
import {
  loadInjectedBrowserRefreshPolicy,
  type BrowserRefreshPolicyRegistry,
} from "../../shared/data/browserRefreshPolicyRegistry";

const INITIAL_SCOPE_RECONNECT_DELAY_MS = 3_000;
const MAX_SCOPE_RECONNECT_DELAY_MS = 30_000;
const SCOPE_RECONNECT_MULTIPLIER = 1.5;

export type {
  HomeEndpointClusterList,
  HomeEndpointClusterOverview,
  HomeEndpointDependencies,
  HomeEndpointInsights,
  HomeEndpointNodeCollection,
  HomeEndpointPodCollection,
} from "./homeEndpointContract";

export function createHomeAdapter(
  endpoints: HomeEndpointDependencies,
  refreshPolicies?: BrowserRefreshPolicyRegistry<"dashboard">,
): HomePort {
  return {
    loadDashboardRefreshPolicy(signal) {
      return loadInjectedBrowserRefreshPolicy(refreshPolicies, "dashboard", signal);
    },

    async listClusterChoices(signal) {
      return withCanonicalFailure(async () =>
        toClusterChoices(await endpoints.listClusters({}, signal))
      );
    },

    async loadClusterOverview(clusterId, signal) {
      return withCanonicalFailure(async () =>
        toClusterOverview(
          clusterId,
          await endpoints.getClusterSummary(clusterId, signal),
        )
      );
    },

    async loadInsights(clusterId, signal) {
      return withCanonicalFailure(async () =>
        toHomeInsights(clusterId, await endpoints.getHomeInsights(clusterId, signal))
      );
    },

    async loadNodes(clusterId, signal) {
      return withCanonicalFailure(async () =>
        toNodeCollection(
          clusterId,
          await endpoints.getClusterNodesSummary(clusterId, signal),
        )
      );
    },

    async loadNodePods(clusterId, nodeName, signal) {
      return withCanonicalFailure(async () =>
        toPodCollection(
          clusterId,
          nodeName,
          await endpoints.getNodePodsSummary(clusterId, nodeName, signal),
        )
      );
    },

    async *subscribeDashboardInvalidations(scope, subscription) {
      let cursor: string | undefined;
      let reconnectAfterMs: number | null = null;
      let attempt = 0;
      let changed = false;
      const signal = subscription?.signal;
      publishScopeOperation(subscription?.onScopeOperation, {
        attempt,
        kind: "progress",
        phase: "context_switch_progress",
        retryAfterMs: null,
        scope,
      });
      while (!signal?.aborted) {
        try {
          for await (const frame of endpoints.subscribeHomeDashboardEvents(scope.clusterId, {
            after: cursor,
            signal,
          })) {
            if (
              frame.scope.workspace_id !== scope.workspaceId ||
              frame.scope.cluster_id !== scope.clusterId ||
              !sameNamespaces(frame.scope.namespaces, scope.namespaces ?? [])
            ) {
              throw new HomePortFailure("invalid-response");
            }
            cursor = frame.cursor;
            reconnectAfterMs = frame.reconnect_after_ms;
            attempt = 0;
            if (frame.kind === "connected" && !changed) {
              changed = true;
              publishScopeOperation(subscription?.onScopeOperation, {
                attempt,
                kind: "completed",
                phase: "context_changed",
                retryAfterMs: null,
                scope: scopeFromFrame(frame.scope),
              });
            }
            if (frame.kind === "deferred_ready") {
              if (!frame.snapshot_id) throw new HomePortFailure("invalid-response");
              yield { snapshotId: frame.snapshot_id };
            }
          }
          if (signal?.aborted) return;
        } catch (error) {
          if (isAbortError(error) || signal?.aborted) return;
          const failure = error instanceof HomePortFailure ? error : toPortFailure(error);
          if (!isRetryableStreamFailure(failure)) throw failure;
        }
        attempt += 1;
        const retryAfterMs = scopeReconnectDelayMs(reconnectAfterMs, attempt);
        publishScopeOperation(subscription?.onScopeOperation, {
          attempt,
          kind: "progress",
          phase: "context_switch_progress",
          retryAfterMs,
          scope: { ...scope, freshness: "disconnected" },
        });
        await waitForServerReconnect(retryAfterMs, signal);
      }
    },
  };
}

function scopeFromFrame(scope: HomeEndpointDashboardEvent["scope"]): ClusterScope {
  return {
    workspaceId: scope.workspace_id,
    clusterId: scope.cluster_id,
    namespaces: scope.namespaces,
    freshness: scope.freshness,
  };
}

function sameNamespaces(left: readonly string[], right: readonly string[]): boolean {
  const canonical = (values: readonly string[]) => [...new Set(values)]
    .map((value) => value.trim())
    .filter(Boolean)
    .sort();
  const leftCanonical = canonical(left);
  const rightCanonical = canonical(right);
  return leftCanonical.length === rightCanonical.length
    && leftCanonical.every((value, index) => value === rightCanonical[index]);
}

function publishScopeOperation(
  listener: ((event: ScopeTransitionOperationEvent) => void) | undefined,
  event: ScopeTransitionOperationEvent,
): void {
  listener?.(event);
}

function scopeReconnectDelayMs(serverDelayMs: number | null, attempt: number): number {
  const base = serverDelayMs ?? INITIAL_SCOPE_RECONNECT_DELAY_MS;
  return Math.min(
    MAX_SCOPE_RECONNECT_DELAY_MS,
    Math.round(base * SCOPE_RECONNECT_MULTIPLIER ** Math.max(0, attempt - 1)),
  );
}

function isRetryableStreamFailure(failure: HomePortFailure): boolean {
  return failure.code === "offline" || failure.code === "rate-limited" || failure.code === "error";
}

function waitForServerReconnect(delayMs: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) return Promise.resolve();
  return new Promise((resolve) => {
    const timer = setTimeout(done, delayMs);
    const abort = () => done();
    signal?.addEventListener("abort", abort, { once: true });
    function done() {
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
      resolve();
    }
  });
}

async function withCanonicalFailure<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (isAbortError(error) || error instanceof HomePortFailure) throw error;
    if (isHomeCanonicalError(error)) {
      throw new HomePortFailure("invalid-response");
    }
    throw toPortFailure(error);
  }
}

function toPortFailure(error: unknown): HomePortFailure {
  const codeByTransportKind: Record<string, HomeFailureCode> = {
    unauthorized: "unauthorized",
    forbidden: "forbidden",
    network: "offline",
    "invalid-payload": "invalid-response",
    "not-found": "not-found",
    "rate-limited": "rate-limited",
  };
  const code = codeByTransportKind[transportKind(error) ?? ""] ?? "error";
  return new HomePortFailure(code, transportRetryAfter(error));
}

function transportKind(error: unknown): string | null {
  return typeof error === "object" && error !== null && "kind" in error &&
    typeof error.kind === "string"
    ? error.kind
    : null;
}

function transportRetryAfter(error: unknown): number | null {
  if (
    typeof error !== "object" || error === null || !("retryAfter" in error) ||
    typeof error.retryAfter !== "number" || !Number.isFinite(error.retryAfter) ||
    error.retryAfter < 0
  ) {
    return null;
  }
  return error.retryAfter;
}

function isAbortError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "name" in error &&
    error.name === "AbortError";
}

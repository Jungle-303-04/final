import { HomePortFailure, type HomeFailureCode, type HomePort } from "./homeContract";
import {
  toClusterChoices,
  toClusterOverview,
  toHomeInsights,
  toNodeCollection,
  toPodCollection,
} from "./homeCanonical";
import type { HomeEndpointDependencies } from "./homeEndpointContract";
import { isHomeCanonicalError } from "./homeValidation";
import {
  loadInjectedBrowserRefreshPolicy,
  type BrowserRefreshPolicyRegistry,
} from "../../shared/data/browserRefreshPolicyRegistry";

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

    async *subscribeDashboardInvalidations(clusterId, subscription) {
      let cursor: string | undefined;
      let reconnectAfterMs: number | null = null;
      const signal = subscription?.signal;
      while (!signal?.aborted) {
        try {
          for await (const frame of endpoints.subscribeHomeDashboardEvents(clusterId, {
            after: cursor,
            signal,
          })) {
            if (frame.scope.cluster_id !== clusterId) {
              throw new HomePortFailure("invalid-response");
            }
            cursor = frame.cursor;
            reconnectAfterMs = frame.reconnect_after_ms;
            if (frame.kind === "deferred_ready") {
              if (!frame.snapshot_id) throw new HomePortFailure("invalid-response");
              yield { snapshotId: frame.snapshot_id };
            }
          }
          if (signal?.aborted || reconnectAfterMs === null) return;
        } catch (error) {
          if (isAbortError(error) || signal?.aborted) return;
          const failure = error instanceof HomePortFailure ? error : toPortFailure(error);
          if (!isRetryableStreamFailure(failure) || reconnectAfterMs === null) throw failure;
        }
        await waitForServerReconnect(reconnectAfterMs, signal);
      }
    },
  };
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

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
  };
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

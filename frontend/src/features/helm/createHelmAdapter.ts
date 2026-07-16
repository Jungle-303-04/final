import {
  HelmPortFailure,
  type HelmClusterScope,
  type HelmFailureCode,
  type HelmObservationCoverage,
  type HelmPort,
  type HelmRelease,
  type HelmReleaseDetail,
  type HelmReleaseHistoryEntry,
  type HelmResourceRef,
  type HelmUnavailableFeature,
} from "./helmContract";
import type { HelmEndpointDependencies } from "./helmEndpointContract";

export function createHelmAdapter(endpoints: HelmEndpointDependencies): HelmPort {
  return {
    async listReleases(request, signal) {
      return withPortFailure(async () => {
        const response = await endpoints.listHelmReleases({
          clusterIds: request.clusterIds,
          namespaces: request.namespaces,
        }, signal);
        return {
          releases: response.releases.map(toRelease),
          coverage: toCoverage(response.coverage),
          refreshAfterSeconds: response.refresh_after_seconds,
        };
      });
    },
    async getRelease(request, signal) {
      return withPortFailure(async () => toDetail(await endpoints.getHelmRelease(request, signal)));
    },
  };
}

function toDetail(value: Awaited<ReturnType<HelmEndpointDependencies["getHelmRelease"]>>): HelmReleaseDetail {
  return {
    release: toRelease(value.detail.release),
    history: value.detail.history.map(toHistory),
    manifest: toUnavailable(value.detail.manifest),
    values: toUnavailable(value.detail.values),
    ownedResources: toUnavailable(value.detail.owned_resources),
    commands: toUnavailable(value.detail.commands),
    refreshAfterSeconds: value.refresh_after_seconds,
  };
}

function toRelease(value: Awaited<ReturnType<HelmEndpointDependencies["listHelmReleases"]>>["releases"][number]): HelmRelease {
  return {
    scope: toScope(value.scope),
    name: value.name,
    storageNamespace: value.storage_namespace,
    storage: toResourceRef(value.storage),
    chart: value.chart,
    appVersion: value.app_version,
    status: value.status,
    revision: value.revision,
    observedAt: value.observed_at,
    resourceHealth: {
      ...toUnavailable(value.resource_health),
      health: value.resource_health.health,
    },
  };
}

function toHistory(value: Awaited<ReturnType<HelmEndpointDependencies["getHelmRelease"]>>["detail"]["history"][number]): HelmReleaseHistoryEntry {
  return {
    storage: toResourceRef(value.storage),
    revision: value.revision,
    status: value.status,
    observedAt: value.observed_at,
  };
}

function toCoverage(value: Awaited<ReturnType<HelmEndpointDependencies["listHelmReleases"]>>["coverage"]): HelmObservationCoverage {
  return {
    availability: value.availability,
    observedAt: value.observed_at,
    reasonCodes: value.reason_codes,
  };
}

function toScope(value: Awaited<ReturnType<HelmEndpointDependencies["listHelmReleases"]>>["releases"][number]["scope"]): HelmClusterScope {
  return {
    workspaceId: value.workspace_id,
    clusterId: value.cluster_id,
    namespaces: value.namespaces,
    freshness: value.freshness,
  };
}

function toResourceRef(value: Awaited<ReturnType<HelmEndpointDependencies["listHelmReleases"]>>["releases"][number]["storage"]): HelmResourceRef {
  return {
    apiGroup: value.api_group,
    version: value.version,
    kind: value.kind,
    namespace: value.namespace,
    name: value.name,
    uid: value.uid,
  };
}

function toUnavailable(value: { availability: "unavailable"; reason_code: string }): HelmUnavailableFeature {
  return { availability: value.availability, reasonCode: value.reason_code };
}

async function withPortFailure<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (isAbortError(error) || error instanceof HelmPortFailure) throw error;
    throw toPortFailure(error);
  }
}

function toPortFailure(error: unknown): HelmPortFailure {
  const kinds: Record<string, HelmFailureCode> = {
    unauthorized: "unauthorized",
    forbidden: "forbidden",
    "invalid-request": "invalid-request",
    "invalid-payload": "invalid-response",
    "not-found": "not-found",
    network: "offline",
    "rate-limited": "rate-limited",
  };
  const kind = stringField(error, "kind");
  const retryAfter = numberField(error, "retryAfter");
  const code = Object.prototype.hasOwnProperty.call(kinds, kind)
    ? kinds[kind as keyof typeof kinds]
    : "error";
  return new HelmPortFailure(code, retryAfter);
}

function stringField(value: unknown, key: string): string {
  const record = recordValue(value);
  return record && typeof record[key] === "string" ? record[key] : "";
}

function numberField(value: unknown, key: string): number | null {
  const record = recordValue(value);
  return record && typeof record[key] === "number" ? record[key] : null;
}

function recordValue(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function isAbortError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "name" in error && error.name === "AbortError";
}

import {
  HelmPortFailure,
  type HelmClusterScope,
  type HelmCommands,
  type HelmFailureCode,
  type HelmObservationCoverage,
  type HelmOwnedResource,
  type HelmOwnedResources,
  type HelmPort,
  type HelmRelease,
  type HelmReleaseDetail,
  type HelmReleaseHistoryEntry,
  type HelmResourceHealth,
  type HelmResourceRef,
  type HelmUnavailableFeature,
  type HelmUpgradeInput,
  type HelmUpgradeTarget,
} from "./helmContract";
import type {
  HelmEndpointCommands,
  HelmEndpointDependencies,
  HelmEndpointOwnedResources,
  HelmEndpointRelease,
  HelmEndpointResourceHealth,
} from "./helmEndpointContract";

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
    ownedResources: toOwnedResources(value.detail.owned_resources),
    commands: toCommands(value.detail.commands),
  };
}

function toRelease(value: HelmEndpointRelease): HelmRelease {
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
    resourceHealth: toResourceHealth(value.resource_health),
  };
}

function toResourceHealth(value: HelmEndpointResourceHealth): HelmResourceHealth {
  if (value.availability === "unavailable") {
    return { availability: "unavailable", reasonCode: value.reason_code, health: value.health };
  }
  return {
    availability: value.availability,
    health: value.health,
    resourceCount: value.resource_count,
    observedAt: value.observed_at,
    reasonCodes: value.reason_codes,
  };
}

function toOwnedResources(value: HelmEndpointOwnedResources): HelmOwnedResources {
  if (value.availability === "unavailable") return toUnavailable(value);
  return {
    availability: value.availability,
    items: value.items.map(toOwnedResource),
    observedAt: value.observed_at,
    truncated: value.truncated,
    reasonCodes: value.reason_codes,
  };
}

function toOwnedResource(value: Extract<HelmEndpointOwnedResources, { items: unknown[] }>["items"][number]): HelmOwnedResource {
  return {
    resource: toResourceRef(value.resource),
    status: value.status,
    health: value.health,
    observedAt: value.observed_at,
  };
}

function toCommands(value: HelmEndpointCommands): HelmCommands {
  if (value.availability === "unavailable") return toUnavailable(value);
  return {
    availability: value.availability,
    actions: value.actions,
    confirmationRequired: value.confirmation_required,
    realtime: value.realtime,
    upgradeTargets: value.upgrade_targets.map(toUpgradeTarget),
  };
}

function toUpgradeTarget(value: Extract<HelmEndpointCommands, { upgrade_targets: unknown[] }>["upgrade_targets"][number]): HelmUpgradeTarget {
  return {
    itemId: value.item_id,
    name: value.name,
    version: value.version,
    chartVersion: value.chart_version,
    inputs: value.inputs.map(toUpgradeInput),
  };
}

function toUpgradeInput(value: HelmUpgradeTargetInput): HelmUpgradeInput {
  return {
    name: value.name,
    valueType: value.value_type,
    required: value.required,
    defaultValue: value.default,
    allowedValues: value.allowed_values,
  };
}

type HelmUpgradeTargetInput = Extract<HelmEndpointCommands, { upgrade_targets: unknown[] }>["upgrade_targets"][number]["inputs"][number];

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

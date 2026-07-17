import {
  type HelmArtifactReceipt,
  type ArtifactHubChart,
  type HelmArtifactResult,
  type HelmClusterScope,
  type HelmObservationCoverage,
  type HelmOwnedResourceObservation,
  type HelmPort,
  type HelmRelease,
  type HelmReleaseCommands,
  type HelmReleaseDetail,
  type HelmReleaseHistoryEntry,
  type HelmReleaseUpgradeInfo,
  type HelmReleaseVersionList,
  type HelmResourceRef,
  type HelmResourceHealth,
  type HelmUnavailableFeature,
} from "./helmContract";
import { recordValue, withHelmPortFailure } from "./helmAdapterRuntime";
import { helmArtifactResultSchema } from "./helmArtifactSchemas";
import { createHelmChartSourcesPort, toChartSource } from "./createHelmChartSourcesPort";
import type { HelmEndpointDependencies } from "./helmEndpointContract";

export function createHelmAdapter(endpoints: HelmEndpointDependencies): HelmPort {
  return {
    ...createHelmChartSourcesPort(endpoints),
    async searchArtifactHub(request, signal) {
      return withHelmPortFailure(async () => {
        const value = await endpoints.searchArtifactHubCharts(request, signal);
        return {
          items: value.items.map(toArtifactHubChart),
          total: value.total,
          offset: value.offset,
          limit: value.limit,
          hasMore: value.has_more,
          observedAt: value.observed_at,
        };
      });
    },
    async getArtifactHubChart(request, signal) {
      return withHelmPortFailure(async () => {
        const value = await endpoints.getArtifactHubChart(request, signal);
        return {
          chart: toArtifactHubChart(value.chart),
          readme: value.readme,
          availableVersions: value.available_versions.map((item) => ({
            version: item.version,
            appVersion: item.app_version,
          })),
          versionsTruncated: value.versions_truncated,
          observedAt: value.observed_at,
        };
      });
    },
    async listReleases(request, signal) {
      return withHelmPortFailure(async () => {
        const response = await endpoints.listHelmReleases({
          clusterIds: request.clusterIds,
          namespaces: request.namespaces,
        }, signal);
        return {
          releases: response.releases.map(toRelease),
          coverage: toCoverage(response.coverage),
          refreshAfterSeconds: response.refresh_after_seconds,
          postMutationRefreshAfterSeconds: response.post_mutation_refresh_after_seconds,
        };
      });
    },
    async getRelease(request, signal) {
      return withHelmPortFailure(async () => toDetail(await endpoints.getHelmRelease(request, signal)));
    },
    async getReleaseUpgradeInfo(request, signal) {
      return withHelmPortFailure(async () => toUpgradeInfo(
        await endpoints.getHelmReleaseUpgradeInfo(request, signal),
      ));
    },
    async listReleaseVersions(request, signal) {
      return withHelmPortFailure(async () => toVersionList(
        await endpoints.listHelmReleaseVersions(request, signal),
      ));
    },
    async checkReleaseUpgrades(request, signal) {
      return withHelmPortFailure(async () => {
        const value = await endpoints.checkHelmReleaseUpgrades({
          clusterIds: request.clusterIds,
          namespaces: request.namespaces,
        }, signal);
        return {
          releases: Object.fromEntries(
            Object.entries(value.releases).map(([key, item]) => [key, toUpgradeInfo(item)]),
          ),
          coverage: toCoverage(value.coverage),
          truncated: value.truncated,
          reasonCodes: value.reason_codes,
          refreshAfterSeconds: value.refresh_after_seconds,
        };
      });
    },
    async readArtifact(request, signal) {
      return withHelmPortFailure(async () => {
        const receipt = await endpoints.startHelmArtifactRead(request, signal);
        if (receipt.audit_event_id !== receipt.event_id) {
          throw new TypeError("Helm artifact audit identity is invalid");
        }
        return toArtifactReceipt(receipt);
      });
    },
    async upgradeRelease(request, signal) {
      return withHelmPortFailure(async () => {
        const receipt = await endpoints.startHelmReleaseUpgrade(request, signal);
        if (receipt.audit_event_id !== receipt.event_id) {
          throw new TypeError("Helm upgrade audit identity is invalid");
        }
        return toArtifactReceipt(receipt);
      });
    },
    async rollbackRelease(request, signal) {
      return withHelmPortFailure(async () => {
        const receipt = await endpoints.startHelmReleaseRollback(request, signal);
        if (receipt.audit_event_id !== receipt.event_id) {
          throw new TypeError("Helm rollback audit identity is invalid");
        }
        return toArtifactReceipt(receipt);
      });
    },
    async uninstallRelease(request, signal) {
      return withHelmPortFailure(async () => {
        const receipt = await endpoints.startHelmReleaseUninstall(request, signal);
        if (receipt.audit_event_id !== receipt.event_id) {
          throw new TypeError("Helm uninstall audit identity is invalid");
        }
        return toArtifactReceipt(receipt);
      });
    },
  };
}

function toArtifactHubChart(value: {
  package_id: string;
  name: string;
  version: string;
  app_version: string | null;
  description: string | null;
  stars: number;
  deprecated: boolean;
  signed: boolean;
  repository: {
    name: string;
    url: string;
    official: boolean;
    verified_publisher: boolean;
  };
}): ArtifactHubChart {
  return {
    packageId: value.package_id,
    name: value.name,
    version: value.version,
    appVersion: value.app_version,
    description: value.description,
    stars: value.stars,
    deprecated: value.deprecated,
    signed: value.signed,
    repository: {
      name: value.repository.name,
      url: value.repository.url,
      official: value.repository.official,
      verifiedPublisher: value.repository.verified_publisher,
    },
  };
}

export function toHelmArtifactOperationResult(value: unknown): HelmArtifactResult | null {
  const payload = recordValue(value);
  const result = recordValue(payload?.result);
  const parsed = helmArtifactResultSchema.safeParse(result?.artifact);
  if (!parsed.success) return null;
  const artifact = parsed.data;
  const common = {
    artifact: artifact.artifact,
    namespace: artifact.namespace,
    releaseName: artifact.release_name,
    revision: artifact.revision,
    comparisonRevision: artifact.comparison_revision,
    allValues: artifact.all_values,
    sourceBytes: artifact.source_bytes,
    redactionApplied: artifact.redaction_applied,
    truncated: artifact.truncated,
  } as const;
  if (artifact.artifact === "hooks_diff") {
    return {
      ...common,
      artifact: artifact.artifact,
      format: artifact.format,
      projectionSha256: artifact.projection_sha256,
      projectionBytes: artifact.projection_bytes,
      hooksDiff: {
        revision1: artifact.hooks_diff.revision1,
        revision2: artifact.hooks_diff.revision2,
        added: artifact.hooks_diff.added.map(toHookDiffItem),
        removed: artifact.hooks_diff.removed.map(toHookDiffItem),
        modified: artifact.hooks_diff.modified.map(toHookDiffItem),
        unchanged: artifact.hooks_diff.unchanged.map(toHookDiffItem),
        parseErrorCount: artifact.hooks_diff.parse_error_count,
      },
    };
  }
  if (artifact.artifact === "resources_diff") {
    return {
      ...common,
      artifact: artifact.artifact,
      format: artifact.format,
      projectionSha256: artifact.projection_sha256,
      projectionBytes: artifact.projection_bytes,
      resourcesDiff: {
        revision1: artifact.resources_diff.revision1,
        revision2: artifact.resources_diff.revision2,
        added: artifact.resources_diff.added.map(toRenderedResourceRef),
        removed: artifact.resources_diff.removed.map(toRenderedResourceRef),
        modified: artifact.resources_diff.modified.map((item) => ({
          ...toRenderedResourceRef(item),
          summary: item.summary,
          fieldCount: item.field_count,
          fields: item.fields.map((field) => ({
            path: field.path,
            oldValue: field.old_value,
            newValue: field.new_value,
          })),
        })),
        unchanged: artifact.resources_diff.unchanged.map(toRenderedResourceRef),
        parseErrorCount: artifact.resources_diff.parse_error_count,
      },
    };
  }
  return {
    ...common,
    artifact: artifact.artifact,
    format: artifact.format === "unified_diff" ? "unified-diff" : "yaml",
    content: artifact.content,
    contentSha256: artifact.content_sha256,
    contentBytes: artifact.content_bytes,
  };
}

function toHookDiffItem(value: {
  api_version: string;
  kind: string;
  name: string;
  namespace: string;
  events: string[];
  weight: number;
  delete_policies: string[];
  output_log_policies: string[];
  manifest_changed: boolean;
}) {
  return {
    apiVersion: value.api_version,
    kind: value.kind,
    name: value.name,
    namespace: value.namespace,
    events: value.events,
    weight: value.weight,
    deletePolicies: value.delete_policies,
    outputLogPolicies: value.output_log_policies,
    manifestChanged: value.manifest_changed,
  };
}

function toRenderedResourceRef(value: {
  api_version: string;
  kind: string;
  name: string;
  namespace: string;
}) {
  return {
    apiVersion: value.api_version,
    kind: value.kind,
    name: value.name,
    namespace: value.namespace,
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
    refreshAfterSeconds: value.refresh_after_seconds,
    postMutationRefreshAfterSeconds: value.post_mutation_refresh_after_seconds,
  };
}

function toRelease(value: Awaited<ReturnType<HelmEndpointDependencies["listHelmReleases"]>>["releases"][number]): HelmRelease {
  return {
    scope: toScope(value.scope),
    name: value.name,
    storageNamespace: value.storage_namespace,
    storage: toResourceRef(value.storage),
    storageResourceVersion: value.storage_resource_version,
    chart: value.chart,
    chartVersion: value.chart_version,
    chartReasonCodes: value.chart_reason_codes,
    appVersion: value.app_version,
    status: value.status,
    revision: value.revision,
    observedAt: value.observed_at,
    resourceHealth: toResourceHealth(value.resource_health),
  };
}

function toUpgradeInfo(
  value: Awaited<ReturnType<HelmEndpointDependencies["getHelmReleaseUpgradeInfo"]>>,
): HelmReleaseUpgradeInfo {
  return {
    availability: value.availability,
    chartName: value.chart_name,
    currentVersion: value.current_version,
    latestVersion: value.latest_version,
    updateAvailable: value.update_available,
    source: value.source ? toChartSource(value.source) : null,
    observedAt: value.observed_at,
    reasonCodes: value.reason_codes,
    refreshAfterSeconds: value.refresh_after_seconds,
  };
}

function toVersionList(
  value: Awaited<ReturnType<HelmEndpointDependencies["listHelmReleaseVersions"]>>,
): HelmReleaseVersionList {
  return {
    availability: value.availability,
    chartName: value.chart_name,
    currentVersion: value.current_version,
    source: value.source ? toChartSource(value.source) : null,
    versions: value.versions.map((item) => ({
      version: item.version,
      appVersion: item.app_version,
      deprecated: item.deprecated,
    })),
    observedAt: value.observed_at,
    truncated: value.truncated,
    reasonCodes: value.reason_codes,
    refreshAfterSeconds: value.refresh_after_seconds,
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

function toResourceHealth(
  value: Awaited<ReturnType<HelmEndpointDependencies["listHelmReleases"]>>["releases"][number]["resource_health"],
): HelmResourceHealth {
  if (value.availability === "unavailable") {
    return { ...toUnavailable(value), health: value.health };
  }
  return {
    availability: value.availability,
    health: value.health,
    resourceCount: value.resource_count,
    observedAt: value.observed_at,
    reasonCodes: value.reason_codes,
  };
}

function toOwnedResources(
  value: Awaited<ReturnType<HelmEndpointDependencies["getHelmRelease"]>>["detail"]["owned_resources"],
): HelmUnavailableFeature | HelmOwnedResourceObservation {
  if (value.availability === "unavailable") return toUnavailable(value);
  return {
    availability: value.availability,
    items: value.items.map((item) => ({
      resource: toResourceRef(item.resource),
      status: item.status,
      health: item.health,
      observedAt: item.observed_at,
    })),
    observedAt: value.observed_at,
    truncated: value.truncated,
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

function toCommands(
  value: Awaited<ReturnType<HelmEndpointDependencies["getHelmRelease"]>>["detail"]["commands"],
): HelmUnavailableFeature | HelmReleaseCommands {
  if (value.availability === "unavailable") return toUnavailable(value);
  return {
    availability: value.availability,
    actions: value.actions,
    confirmationRequired: value.confirmation_required,
    realtime: value.realtime,
    upgradeTargets: value.upgrade_targets.map((target) => ({
      itemId: target.item_id,
      name: target.name,
      version: target.version,
      chartVersion: target.chart_version,
      inputs: target.inputs.map((input) => ({
        name: input.name,
        valueType: input.value_type,
        required: input.required,
        defaultValue: input.default,
        allowedValues: input.allowed_values,
      })),
    })),
  };
}

function toArtifactReceipt(
  value:
    | Awaited<ReturnType<HelmEndpointDependencies["startHelmArtifactRead"]>>
    | Awaited<ReturnType<HelmEndpointDependencies["startHelmReleaseUpgrade"]>>
    | Awaited<ReturnType<HelmEndpointDependencies["startHelmReleaseRollback"]>>
    | Awaited<ReturnType<HelmEndpointDependencies["startHelmReleaseUninstall"]>>,
): HelmArtifactReceipt {
  return {
    accepted: value.accepted,
    eventId: value.event_id,
    auditEventId: value.audit_event_id,
    correlationId: value.correlation_id,
    commandId: value.command_id,
    status: value.status,
  };
}

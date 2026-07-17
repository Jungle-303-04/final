import { apiRequest, type ApiPath } from "./client";
import {
  helmInstallTargetsSchema,
  helmReleaseDetailSchema,
  helmReleaseListSchema,
  helmReleaseUpgradeBatchSchema,
  helmReleaseUpgradeInfoSchema,
  helmReleaseVersionListSchema,
  type HelmReleaseDetailEndpoint,
  type HelmReleaseListEndpoint,
  type HelmReleaseUpgradeBatchEndpoint,
  type HelmReleaseUpgradeInfoEndpoint,
  type HelmReleaseVersionListEndpoint,
} from "./helm-releases-schemas";
import {
  resourceActionAcceptedSchema,
  type ResourceActionAccepted,
} from "./resource-capability-actions-schemas";
import { canonicalFacetSelections } from "./resource-filter-query";
import { encodePathSegment, withQuery } from "./url";

export const HELM_RELEASES_PATH = "/api/helm/releases" as const;
export const HELM_RELEASE_PATH = "/api/helm/releases/{namespace}/{release_name}" as const;
export const HELM_RELEASE_ARTIFACT_PATH =
  "/api/helm/releases/{namespace}/{release_name}/artifacts" as const;
export const HELM_RELEASE_UPGRADE_PATH =
  "/api/helm/releases/{namespace}/{release_name}/upgrade" as const;
export const HELM_RELEASE_ROLLBACK_STREAM_PATH =
  "/api/helm/releases/{namespace}/{release_name}/rollback-stream" as const;
export const HELM_RELEASE_VALUES_PATH =
  "/api/helm/releases/{namespace}/{release_name}/values" as const;
export const HELM_RELEASE_VALUES_PREVIEW_PATH =
  "/api/helm/releases/{namespace}/{release_name}/values/preview" as const;
export const HELM_RELEASE_UPGRADE_INFO_PATH =
  "/api/helm/releases/{namespace}/{release_name}/upgrade-info" as const;
export const HELM_RELEASE_VERSIONS_PATH =
  "/api/helm/releases/{namespace}/{release_name}/versions" as const;
export const HELM_UPGRADE_CHECK_PATH = "/api/helm/upgrade-check" as const;
export const HELM_INSTALL_TARGETS_PATH = "/api/helm/install-targets" as const;
export const HELM_RELEASE_INSTALL_STREAM_PATH = "/api/helm/releases/install-stream" as const;

export interface HelmReleaseListQuery {
  clusterIds?: readonly string[];
  namespaces?: readonly string[];
}

export function listHelmInstallTargets(signal?: AbortSignal) {
  return apiRequest(HELM_INSTALL_TARGETS_PATH, helmInstallTargetsSchema, { signal });
}

export function startHelmReleaseInstall(
  input: {
    clusterId: string;
    namespace: string;
    applicationName: string;
    releaseName: string;
    catalogItemId: string;
    catalogVersion: string;
    values: Readonly<Record<string, unknown>>;
    confirmation: true;
    idempotencyKey: string;
  },
  signal?: AbortSignal,
) {
  const idempotencyKey = requiredIdentity(input.idempotencyKey, "idempotencyKey");
  if (idempotencyKey.length < 8 || idempotencyKey.length > 128) {
    throw new RangeError("idempotencyKey length is invalid");
  }
  return apiRequest(HELM_RELEASE_INSTALL_STREAM_PATH, resourceActionAcceptedSchema, {
    method: "POST",
    headers: { "content-type": "application/json", "Idempotency-Key": idempotencyKey },
    body: JSON.stringify({
      cluster_id: requiredIdentity(input.clusterId, "clusterId"),
      namespace: requiredIdentity(input.namespace, "namespace"),
      application_name: requiredIdentity(input.applicationName, "applicationName"),
      release_name: requiredIdentity(input.releaseName, "releaseName"),
      catalog_item_id: requiredIdentity(input.catalogItemId, "catalogItemId"),
      catalog_version: requiredIdentity(input.catalogVersion, "catalogVersion"),
      values: input.values,
      confirmation: input.confirmation,
    }),
    signal,
  });
}

export function listHelmReleases(
  query: HelmReleaseListQuery = {},
  signal?: AbortSignal,
): Promise<HelmReleaseListEndpoint> {
  return apiRequest(withQuery(HELM_RELEASES_PATH, [
    ["clusters", joined("clusters", query.clusterIds)],
    ["namespaces", joined("namespaces", query.namespaces)],
  ]), helmReleaseListSchema, { signal });
}

export function getHelmRelease(
  input: { clusterId: string; namespace: string; releaseName: string },
  signal?: AbortSignal,
): Promise<HelmReleaseDetailEndpoint> {
  const clusterId = requiredIdentity(input.clusterId, "clusterId");
  const namespace = requiredIdentity(input.namespace, "namespace");
  const releaseName = requiredIdentity(input.releaseName, "releaseName");
  const path = HELM_RELEASE_PATH
    .replace("{namespace}", encodePathSegment(namespace))
    .replace("{release_name}", encodePathSegment(releaseName)) as ApiPath;
  return apiRequest(withQuery(path, [["cluster_id", clusterId]]), helmReleaseDetailSchema, { signal });
}

export function getHelmReleaseUpgradeInfo(
  input: { clusterId: string; namespace: string; releaseName: string },
  signal?: AbortSignal,
): Promise<HelmReleaseUpgradeInfoEndpoint> {
  return apiRequest(
    releaseReadPath(HELM_RELEASE_UPGRADE_INFO_PATH, input),
    helmReleaseUpgradeInfoSchema,
    { signal },
  );
}

export function listHelmReleaseVersions(
  input: { clusterId: string; namespace: string; releaseName: string },
  signal?: AbortSignal,
): Promise<HelmReleaseVersionListEndpoint> {
  return apiRequest(
    releaseReadPath(HELM_RELEASE_VERSIONS_PATH, input),
    helmReleaseVersionListSchema,
    { signal },
  );
}

export function checkHelmReleaseUpgrades(
  query: HelmReleaseListQuery = {},
  signal?: AbortSignal,
): Promise<HelmReleaseUpgradeBatchEndpoint> {
  return apiRequest(withQuery(HELM_UPGRADE_CHECK_PATH, [
    ["clusters", joined("clusters", query.clusterIds)],
    ["namespaces", joined("namespaces", query.namespaces)],
  ]), helmReleaseUpgradeBatchSchema, { signal });
}

export function startHelmArtifactRead(
  input: {
    clusterId: string;
    namespace: string;
    releaseName: string;
    artifact:
      | "manifest"
      | "values"
      | "manifest_diff"
      | "values_diff"
      | "notes_diff"
      | "hooks_diff"
      | "resources_diff";
    revision: number;
    comparisonRevision?: number;
    allValues?: boolean;
  },
  signal?: AbortSignal,
): Promise<ResourceActionAccepted> {
  const clusterId = requiredIdentity(input.clusterId, "clusterId");
  const namespace = requiredIdentity(input.namespace, "namespace");
  const releaseName = requiredIdentity(input.releaseName, "releaseName");
  const path = HELM_RELEASE_ARTIFACT_PATH
    .replace("{namespace}", encodePathSegment(namespace))
    .replace("{release_name}", encodePathSegment(releaseName)) as ApiPath;
  return apiRequest(path, resourceActionAcceptedSchema, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      cluster_id: clusterId,
      artifact: input.artifact,
      revision: input.revision,
      comparison_revision: input.comparisonRevision ?? null,
      all_values: input.allValues ?? false,
    }),
    signal,
  });
}

export function startHelmReleaseUpgrade(
  input: {
    clusterId: string;
    namespace: string;
    releaseName: string;
    expectedRevision: number;
    catalogItemId: string;
    catalogVersion: string;
    values: Readonly<Record<string, unknown>>;
    confirmation: true;
    reason?: string;
  },
  signal?: AbortSignal,
): Promise<ResourceActionAccepted> {
  const clusterId = requiredIdentity(input.clusterId, "clusterId");
  const namespace = requiredIdentity(input.namespace, "namespace");
  const releaseName = requiredIdentity(input.releaseName, "releaseName");
  const catalogItemId = requiredIdentity(input.catalogItemId, "catalogItemId");
  const catalogVersion = requiredIdentity(input.catalogVersion, "catalogVersion");
  if (!Number.isInteger(input.expectedRevision) || input.expectedRevision < 1) {
    throw new RangeError("expectedRevision must be a positive integer");
  }
  const path = HELM_RELEASE_UPGRADE_PATH
    .replace("{namespace}", encodePathSegment(namespace))
    .replace("{release_name}", encodePathSegment(releaseName)) as ApiPath;
  return apiRequest(path, resourceActionAcceptedSchema, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      cluster_id: clusterId,
      expected_revision: input.expectedRevision,
      catalog_item_id: catalogItemId,
      catalog_version: catalogVersion,
      values: input.values,
      confirmation: input.confirmation,
      reason: input.reason,
    }),
    signal,
  });
}

export function applyHelmReleaseValues(
  input: Parameters<typeof startHelmReleaseUpgrade>[0],
  signal?: AbortSignal,
): Promise<ResourceActionAccepted> {
  const path = HELM_RELEASE_VALUES_PATH
    .replace("{namespace}", encodePathSegment(requiredIdentity(input.namespace, "namespace")))
    .replace("{release_name}", encodePathSegment(requiredIdentity(input.releaseName, "releaseName"))) as ApiPath;
  if (!Number.isInteger(input.expectedRevision) || input.expectedRevision < 1) {
    throw new RangeError("expectedRevision must be a positive integer");
  }
  return apiRequest(path, resourceActionAcceptedSchema, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      cluster_id: requiredIdentity(input.clusterId, "clusterId"),
      expected_revision: input.expectedRevision,
      catalog_item_id: requiredIdentity(input.catalogItemId, "catalogItemId"),
      catalog_version: requiredIdentity(input.catalogVersion, "catalogVersion"),
      values: input.values,
      confirmation: input.confirmation,
      reason: input.reason,
    }),
    signal,
  });
}

export function startHelmReleaseValuesPreview(
  input: {
    clusterId: string;
    namespace: string;
    releaseName: string;
    expectedRevision: number;
    catalogItemId: string;
    catalogVersion: string;
    values: Readonly<Record<string, unknown>>;
  },
  signal?: AbortSignal,
): Promise<ResourceActionAccepted> {
  const path = releaseMutationPath(HELM_RELEASE_VALUES_PREVIEW_PATH, input);
  if (!Number.isInteger(input.expectedRevision) || input.expectedRevision < 1) {
    throw new RangeError("expectedRevision must be a positive integer");
  }
  return apiRequest(path, resourceActionAcceptedSchema, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      cluster_id: requiredIdentity(input.clusterId, "clusterId"),
      expected_revision: input.expectedRevision,
      catalog_item_id: requiredIdentity(input.catalogItemId, "catalogItemId"),
      catalog_version: requiredIdentity(input.catalogVersion, "catalogVersion"),
      values: input.values,
    }),
    signal,
  });
}

export function startHelmReleaseRollback(
  input: {
    clusterId: string;
    namespace: string;
    releaseName: string;
    expectedRevision: number;
    revision: number;
    confirmation: true;
    reason?: string;
  },
  signal?: AbortSignal,
): Promise<ResourceActionAccepted> {
  const path = releaseMutationPath(HELM_RELEASE_ROLLBACK_STREAM_PATH, input);
  if (!Number.isInteger(input.expectedRevision) || input.expectedRevision < 2) {
    throw new RangeError("expectedRevision must be an integer greater than one");
  }
  if (!Number.isInteger(input.revision) || input.revision < 1 || input.revision >= input.expectedRevision) {
    throw new RangeError("revision must be an older positive revision");
  }
  return apiRequest(path, resourceActionAcceptedSchema, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      cluster_id: requiredIdentity(input.clusterId, "clusterId"),
      expected_revision: input.expectedRevision,
      revision: input.revision,
      confirmation: input.confirmation,
      reason: input.reason,
    }),
    signal,
  });
}

export function startHelmReleaseUninstall(
  input: {
    clusterId: string;
    namespace: string;
    releaseName: string;
    expectedRevision: number;
    confirmation: true;
    reason?: string;
  },
  signal?: AbortSignal,
): Promise<ResourceActionAccepted> {
  const path = releaseMutationPath(HELM_RELEASE_PATH, input);
  if (!Number.isInteger(input.expectedRevision) || input.expectedRevision < 1) {
    throw new RangeError("expectedRevision must be a positive integer");
  }
  return apiRequest(path, resourceActionAcceptedSchema, {
    method: "DELETE",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      cluster_id: requiredIdentity(input.clusterId, "clusterId"),
      expected_revision: input.expectedRevision,
      confirmation: input.confirmation,
      reason: input.reason,
    }),
    signal,
  });
}

function releaseMutationPath(
  template:
    | typeof HELM_RELEASE_PATH
    | typeof HELM_RELEASE_ROLLBACK_STREAM_PATH
    | typeof HELM_RELEASE_VALUES_PREVIEW_PATH,
  input: { namespace: string; releaseName: string },
): ApiPath {
  return template
    .replace("{namespace}", encodePathSegment(requiredIdentity(input.namespace, "namespace")))
    .replace("{release_name}", encodePathSegment(requiredIdentity(input.releaseName, "releaseName"))) as ApiPath;
}

function releaseReadPath(
  template: typeof HELM_RELEASE_UPGRADE_INFO_PATH | typeof HELM_RELEASE_VERSIONS_PATH,
  input: { clusterId: string; namespace: string; releaseName: string },
): ApiPath {
  const clusterId = requiredIdentity(input.clusterId, "clusterId");
  const namespace = requiredIdentity(input.namespace, "namespace");
  const releaseName = requiredIdentity(input.releaseName, "releaseName");
  const path = template
    .replace("{namespace}", encodePathSegment(namespace))
    .replace("{release_name}", encodePathSegment(releaseName)) as ApiPath;
  return withQuery(path, [["cluster_id", clusterId]]);
}

function joined(
  axis: "clusters" | "namespaces",
  values: readonly string[] | undefined,
): string | undefined {
  const canonical = canonicalFacetSelections(axis, values);
  return canonical.length === 0 ? undefined : canonical.join(",");
}

function requiredIdentity(value: string, name: string): string {
  const normalized = value.trim();
  if (normalized === "") throw new RangeError(`${name} must not be empty`);
  return normalized;
}

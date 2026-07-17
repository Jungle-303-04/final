import { apiRequest, type ApiPath } from "./client";
import { canonicalFacetSelections } from "./resource-filter-query";
import {
  checksDetailResponseSchema,
  checksOverviewSchema,
  checksSettingsSchema,
  checksSettingsUpdateSchema,
  type ChecksDetailEndpoint,
  type ChecksOverviewEndpoint,
  type ChecksSettingsEndpoint,
  type ChecksSettingsUpdateEndpoint,
} from "./checks-schemas";
import { withQuery } from "./url";
import type { ResourceRef } from "../shared/parity/referenceParity";

export const CHECKS_OVERVIEW_PATH = "/api/checks/overview" as const;
export const CHECKS_SETTINGS_PATH = "/api/settings/audit" as const;
export const checksDetailPath = (checkId: string): ApiPath => `/api/checks/${encodeURIComponent(checkId)}`;

export interface ChecksQuery {
  clusterIds?: readonly string[];
  namespaces?: readonly string[];
  resource?: ResourceRef;
}

export function getChecksOverview(
  query: ChecksQuery = {},
  signal?: AbortSignal,
): Promise<ChecksOverviewEndpoint> {
  return apiRequest(withScope(CHECKS_OVERVIEW_PATH, query), checksOverviewSchema, { signal });
}

export function getChecksDetail(
  checkId: string,
  query: ChecksQuery = {},
  signal?: AbortSignal,
): Promise<ChecksDetailEndpoint> {
  return apiRequest(withScope(checksDetailPath(checkId), query), checksDetailResponseSchema, { signal });
}

export function getChecksSettings(signal?: AbortSignal): Promise<ChecksSettingsEndpoint> {
  return apiRequest(CHECKS_SETTINGS_PATH, checksSettingsSchema, { signal });
}

export function updateChecksSettings(
  payload: {
    policy: ChecksSettingsEndpoint["policy"];
    expected_revision: number;
  },
  signal?: AbortSignal,
): Promise<ChecksSettingsUpdateEndpoint> {
  return apiRequest(CHECKS_SETTINGS_PATH, checksSettingsUpdateSchema, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
    signal,
  });
}

function withScope(path: ApiPath, query: ChecksQuery): ApiPath {
  return withQuery(path, [
    ["clusters", joined("clusters", query.clusterIds)],
    ["namespaces", joined("namespaces", query.namespaces)],
    ["resource_group", query.resource?.apiGroup],
    ["resource_version", query.resource?.version],
    ["resource_kind", query.resource?.kind],
    ["resource_namespace", query.resource?.namespace ?? undefined],
    ["resource_name", query.resource?.name],
    ["resource_uid", query.resource?.uid],
  ]);
}

function joined(
  axis: "clusters" | "namespaces",
  values: readonly string[] | undefined,
): string | undefined {
  const canonical = canonicalFacetSelections(axis, values);
  return canonical.length === 0 ? undefined : canonical.join(",");
}

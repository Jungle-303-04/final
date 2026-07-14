import { apiRequest, type ApiPath } from "./client";
import {
  applicationCatalogSchema,
  applicationDeploymentHistorySchema,
  applicationDetailSchema,
  applicationDriftSchema,
  type ApplicationCatalogEndpoint,
  type ApplicationDeploymentHistoryEndpoint,
  type ApplicationDetailEndpoint,
  type ApplicationDriftEndpoint,
} from "./application-catalog-schemas";
import {
  boundedQuery,
  canonicalFacetSelections,
  canonicalLabelSelections,
} from "./resource-filter-query";
import { encodePathSegment, withQuery } from "./url";

export const APPLICATION_CATALOG_PATH: ApiPath = "/api/applications";

export interface ApplicationCatalogQuery {
  clusters?: readonly string[];
  namespaces?: readonly string[];
  applications?: readonly string[];
  labels?: readonly string[];
  environments?: readonly string[];
  statuses?: readonly string[];
  pendingPromotion?: boolean;
  query?: string;
}

export function listApplicationCatalog(
  query: ApplicationCatalogQuery = {},
  signal?: AbortSignal,
): Promise<ApplicationCatalogEndpoint> {
  const path = withQuery(APPLICATION_CATALOG_PATH, [
    ["clusters", joined("clusters", query.clusters)],
    ["namespaces", joined("namespaces", query.namespaces)],
    ["applications", joined("applications", query.applications)],
    ["labels", joinedLabels(query.labels)],
    ["applications.environment", joined("applications", query.environments)],
    ["applications.status", joined("applications", query.statuses)],
    ["applications.pendingPromotion", query.pendingPromotion || undefined],
    ["applications.q", boundedQuery("query", query.query)],
  ]);
  return apiRequest(path, applicationCatalogSchema, { signal });
}

export function getApplicationOverview(
  applicationId: string,
  signal?: AbortSignal,
): Promise<ApplicationDetailEndpoint> {
  return apiRequest(applicationPath(applicationId), applicationDetailSchema, { signal });
}

export function listApplicationDeploymentHistory(
  applicationId: string,
  signal?: AbortSignal,
): Promise<ApplicationDeploymentHistoryEndpoint> {
  return apiRequest(
    `${applicationPath(applicationId)}/deployments` as ApiPath,
    applicationDeploymentHistorySchema,
    { signal },
  );
}

export function getApplicationDrift(
  applicationId: string,
  signal?: AbortSignal,
): Promise<ApplicationDriftEndpoint> {
  return apiRequest(
    `${applicationPath(applicationId)}/drift` as ApiPath,
    applicationDriftSchema,
    { signal },
  );
}

function applicationPath(applicationId: string): ApiPath {
  if (applicationId.trim() === "") {
    throw new RangeError("applicationId must not be empty");
  }
  return `/api/applications/${encodePathSegment(applicationId)}` as ApiPath;
}

function joined(
  axis: "clusters" | "namespaces" | "applications",
  values: readonly string[] | undefined,
): string | undefined {
  const canonical = canonicalFacetSelections(axis, values);
  return canonical.length === 0 ? undefined : canonical.join(",");
}

function joinedLabels(values: readonly string[] | undefined): string | undefined {
  const canonical = canonicalLabelSelections(values);
  return canonical.length === 0 ? undefined : canonical.join(",");
}

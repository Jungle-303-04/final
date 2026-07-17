import { apiRequest, type ApiPath } from "./client";
import { resourceIssueListSchema, type ResourceIssueList } from "./schemas";
import { optionalQueryString, withQuery } from "./url";

export const RESOURCE_ISSUES_PATH = "/api/dashboard/resources/issues" as ApiPath;
export const RESOURCE_ISSUES_DEFAULT_LIMIT = 25;
export const RESOURCE_ISSUES_MAX_LIMIT = 100;

export interface ResourceIssuesQuery {
  clusterId: string;
  kind: string;
  namespace: string | null;
  name: string;
  limit?: number;
}

export function getResourceIssues(
  query: ResourceIssuesQuery,
  signal?: AbortSignal,
): Promise<ResourceIssueList> {
  const limit = query.limit ?? RESOURCE_ISSUES_DEFAULT_LIMIT;
  if (!Number.isInteger(limit) || limit < 1 || limit > RESOURCE_ISSUES_MAX_LIMIT) {
    throw new RangeError(`resource issue limit must be between 1 and ${RESOURCE_ISSUES_MAX_LIMIT}`);
  }
  return apiRequest(
    withQuery(RESOURCE_ISSUES_PATH, [
      ["cluster_id", query.clusterId],
      ["kind", query.kind],
      ["namespace", optionalQueryString(query.namespace)],
      ["name", query.name],
      ["limit", limit],
    ]),
    resourceIssueListSchema,
    { signal },
  );
}

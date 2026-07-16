import {
  IssuesRequestError,
  type IssueDetailRequest,
  type IssueListRequest,
  type IssueQueueFilters,
} from "./issuesContract";

export { IssuesCanonicalError, IssuesRequestError } from "./issuesContract";

const ISSUE_LIST_MAX_LIMIT = 100;

export function canonicalIssueListRequest(
  clusterId: string | null,
  limit: number,
  filters: IssueQueueFilters = EMPTY_ISSUE_QUEUE_FILTERS,
): IssueListRequest {
  return {
    clusterId: optionalIdentity(clusterId, "cluster_id"),
    filters: canonicalQueueFilters(filters),
    limit: listLimit(limit),
  };
}

export const EMPTY_ISSUE_QUEUE_FILTERS: IssueQueueFilters = Object.freeze({
  namespaces: Object.freeze([]),
  severities: Object.freeze([]),
  categories: Object.freeze([]),
});

function canonicalQueueFilters(filters: IssueQueueFilters): IssueQueueFilters {
  return {
    namespaces: filterValues(filters.namespaces, "namespaces"),
    severities: filterValues(filters.severities, "severity") as IssueQueueFilters["severities"],
    categories: filterValues(filters.categories, "category"),
  };
}

function filterValues(values: readonly string[], field: string): string[] {
  if (values.length > 100) throw new IssuesRequestError(`${field} has too many values`);
  const normalized = [...new Set(values.map((value) => value.trim().toLowerCase()))].sort();
  if (normalized.some((value) => !value || value.length > 253 || value.includes(","))) {
    throw new IssuesRequestError(`${field} contains an invalid value`);
  }
  return normalized;
}

export function canonicalIssueDetailRequest(
  incidentId: string,
  clusterId: string | null,
): IssueDetailRequest {
  return {
    incidentId: requiredIdentity(incidentId, "incident_id"),
    clusterId: optionalIdentity(clusterId, "cluster_id"),
  };
}

export function issueStableId(workspaceId: string, correlationId: string): string {
  return `issue:${encodeURIComponent(workspaceId)}/${encodeURIComponent(correlationId)}`;
}

function listLimit(value: number): number {
  if (!Number.isInteger(value) || value < 1 || value > ISSUE_LIST_MAX_LIMIT) {
    throw new IssuesRequestError(
      `Issues list limit must be an integer from 1 to ${ISSUE_LIST_MAX_LIMIT}`,
    );
  }
  return value;
}

function requiredIdentity(value: string, field: string): string {
  const normalized = value.trim();
  if (!normalized) {
    throw new IssuesRequestError(`${field} is required`);
  }
  return normalized;
}

function optionalIdentity(value: string | null, field: string): string | null {
  if (value === null) return null;
  const normalized = value.trim();
  if (!normalized) {
    throw new IssuesRequestError(`${field} must not be blank`);
  }
  return normalized;
}

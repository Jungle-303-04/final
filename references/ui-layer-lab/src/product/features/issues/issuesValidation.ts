import {
  IssuesRequestError,
  type IssueDetailRequest,
  type IssueListRequest,
} from "./issuesContract";

export { IssuesCanonicalError, IssuesRequestError } from "./issuesContract";

const ISSUE_LIST_MAX_LIMIT = 100;

export function canonicalIssueListRequest(
  clusterId: string | null,
  limit: number,
): IssueListRequest {
  return {
    clusterId: optionalIdentity(clusterId, "cluster_id"),
    limit: listLimit(limit),
  };
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

import { IssuesCanonicalError, IssuesRequestError } from "./issuesContract";
import type {
  IssuesEndpointRecentChangeItem,
  IssuesEndpointRecentChangesResponse,
} from "./issuesEndpointContract";
import {
  ISSUE_RECENT_CHANGES_LIMIT,
  type IssueRecentChange,
  type IssueRecentChanges,
} from "./issuesRecentChangesContract";

export function toIssueRecentChanges(
  incidentId: string,
  response: IssuesEndpointRecentChangesResponse,
): IssueRecentChanges {
  requireRequestIdentity(incidentId, "incident_id");
  requireResponseIdentity(response.incident_id, "recent changes incident_id");
  if (response.incident_id !== incidentId) {
    throw new IssuesCanonicalError(
      "Recent changes incident_id does not match request",
    );
  }
  if (response.limit !== ISSUE_RECENT_CHANGES_LIMIT) {
    throw new IssuesCanonicalError("Unexpected recent changes response limit");
  }

  const eventIds = new Set<string>();
  const items = response.items.map((item) => {
    const change = toIssueRecentChange(item);
    if (eventIds.has(change.eventId)) {
      throw new IssuesCanonicalError(
        "Recent changes response contains duplicate event identities",
      );
    }
    eventIds.add(change.eventId);
    return change;
  });

  return {
    incidentId,
    items,
    limit: ISSUE_RECENT_CHANGES_LIMIT,
  };
}

function toIssueRecentChange(
  item: IssuesEndpointRecentChangeItem,
): IssueRecentChange {
  requireResponseIdentity(item.event_id, "recent change event_id");
  requireResponseIdentity(item.changed_at, "recent change changed_at");
  if (!Number.isFinite(Date.parse(item.changed_at))) {
    throw new IssuesCanonicalError("Recent change changed_at is not parseable");
  }
  requireResponseIdentity(item.namespace, "recent change namespace");
  requireResponseIdentity(item.resource_kind, "recent change resource_kind");
  requireResponseIdentity(item.resource_name, "recent change resource_name");
  requireNullableIdentity(item.image_before, "recent change image_before");
  requireNullableIdentity(item.image_after, "recent change image_after");
  requireResponseIdentity(item.commit_sha, "recent change commit_sha");
  requireResponseIdentity(item.repository_id, "recent change repository_id");
  requireResponseIdentity(item.repo_ref, "recent change repo_ref");
  requireResponseIdentity(item.workflow_run_id, "recent change workflow_run_id");

  return {
    eventId: item.event_id,
    changedAt: item.changed_at,
    namespace: item.namespace,
    resourceKind: item.resource_kind,
    resourceName: item.resource_name,
    imageBefore: item.image_before,
    imageAfter: item.image_after,
    pullRequestUrl: safeHttpUrl(item.pr_url),
    commitSha: item.commit_sha,
    repositoryId: item.repository_id,
    repoRef: item.repo_ref,
    workflowRunId: item.workflow_run_id,
  };
}

function requireRequestIdentity(value: string, field: string): void {
  if (value.trim() === "") {
    throw new IssuesRequestError(`${field} is required`);
  }
}

function requireResponseIdentity(value: string, field: string): void {
  if (value.trim() === "") {
    throw new IssuesCanonicalError(`${field} is required`);
  }
}

function requireNullableIdentity(value: string | null, field: string): void {
  if (value !== null) requireResponseIdentity(value, field);
}

function safeHttpUrl(value: string | null): string | null {
  if (value === null || value.trim() === "") return null;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:" ? value : null;
  } catch {
    return null;
  }
}

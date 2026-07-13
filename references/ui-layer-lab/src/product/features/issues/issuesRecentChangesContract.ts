export const ISSUE_RECENT_CHANGES_LIMIT = 5 as const;

export interface IssueRecentChange {
  eventId: string;
  changedAt: string;
  namespace: string;
  resourceKind: string;
  resourceName: string;
  imageBefore: string | null;
  imageAfter: string | null;
  pullRequestUrl: string | null;
  commitSha: string;
  repositoryId: string;
  repoRef: string;
  workflowRunId: string;
}

export interface IssueRecentChanges {
  incidentId: string;
  items: IssueRecentChange[];
  limit: typeof ISSUE_RECENT_CHANGES_LIMIT;
}

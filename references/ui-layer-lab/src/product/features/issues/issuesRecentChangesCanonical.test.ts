import { describe, expect, it } from "vitest";

import { IssuesCanonicalError } from "./issuesContract";
import { toIssueRecentChanges } from "./issuesRecentChangesCanonical";

const FIRST_CHANGE = {
  event_id: "event-change-1",
  changed_at: "2026-07-13T04:02:00+00:00",
  namespace: "payments",
  resource_kind: "Deployment",
  resource_name: "checkout-api",
  image_before: "registry.example/checkout:v1",
  image_after: "registry.example/checkout:v2",
  pr_url: "https://github.com/acme/platform/pull/42",
  commit_sha: "0123456789abcdef",
  repository_id: "repository-1",
  repo_ref: "github.com/acme/platform",
  workflow_run_id: "workflow-run-1",
};

const SECOND_CHANGE = {
  ...FIRST_CHANGE,
  event_id: "event-change-2",
  changed_at: "2026-07-13T03:58:00+00:00",
  image_before: null,
  image_after: null,
  pr_url: null,
  commit_sha: "fedcba9876543210",
  workflow_run_id: "workflow-run-2",
};

const RESPONSE = {
  incident_id: "incident-1",
  items: [FIRST_CHANGE, SECOND_CHANGE],
  limit: 5,
};

describe("Issues recent changes canonical mapping", () => {
  it("preserves server order, event identity, workload identity, and nullable fields", () => {
    const recentChanges = toIssueRecentChanges("incident-1", RESPONSE);

    expect(recentChanges).toEqual({
      incidentId: "incident-1",
      limit: 5,
      items: [
        {
          eventId: "event-change-1",
          changedAt: "2026-07-13T04:02:00+00:00",
          namespace: "payments",
          resourceKind: "Deployment",
          resourceName: "checkout-api",
          imageBefore: "registry.example/checkout:v1",
          imageAfter: "registry.example/checkout:v2",
          pullRequestUrl: "https://github.com/acme/platform/pull/42",
          commitSha: "0123456789abcdef",
          repositoryId: "repository-1",
          repoRef: "github.com/acme/platform",
          workflowRunId: "workflow-run-1",
        },
        {
          eventId: "event-change-2",
          changedAt: "2026-07-13T03:58:00+00:00",
          namespace: "payments",
          resourceKind: "Deployment",
          resourceName: "checkout-api",
          imageBefore: null,
          imageAfter: null,
          pullRequestUrl: null,
          commitSha: "fedcba9876543210",
          repositoryId: "repository-1",
          repoRef: "github.com/acme/platform",
          workflowRunId: "workflow-run-2",
        },
      ],
    });
    expect(recentChanges.items.map(({ eventId }) => eventId)).toEqual([
      "event-change-1",
      "event-change-2",
    ]);
  });

  it("accepts an empty successful response without inventing a change", () => {
    expect(toIssueRecentChanges("incident-1", {
      ...RESPONSE,
      items: [],
    })).toEqual({
      incidentId: "incident-1",
      items: [],
      limit: 5,
    });
  });

  it("rejects a response for another incident", () => {
    expect(() => toIssueRecentChanges("incident-1", {
      ...RESPONSE,
      incident_id: "incident-2",
    })).toThrow(IssuesCanonicalError);
  });

  it("rejects duplicate event identities without dropping or merging rows", () => {
    expect(() => toIssueRecentChanges("incident-1", {
      ...RESPONSE,
      items: [FIRST_CHANGE, { ...SECOND_CHANGE, event_id: FIRST_CHANGE.event_id }],
    })).toThrow(IssuesCanonicalError);
  });

  it("degrades an unsafe pull request URL to null without dropping the change", () => {
    const recentChanges = toIssueRecentChanges("incident-1", {
      ...RESPONSE,
      items: [{ ...FIRST_CHANGE, pr_url: "javascript:alert(1)" }],
    });

    expect(recentChanges.items).toHaveLength(1);
    expect(recentChanges.items[0]).toMatchObject({
      eventId: "event-change-1",
      pullRequestUrl: null,
    });
  });
});

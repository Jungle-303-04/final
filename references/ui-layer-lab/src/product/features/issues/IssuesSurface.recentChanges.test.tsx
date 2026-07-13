// @vitest-environment jsdom
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { IssuesSurface } from "./IssuesSurface";
import { IssuesPortFailure, type IssueSummary } from "./issuesContract";
import { COPY, issuesPort, renderSurface } from "./IssuesSurface.testSupport";

afterEach(cleanup);

const RECENT_CHANGES_COPY = {
  ...COPY,
  recentChangesLabel: "Recent changes",
  recentChangesUnavailable: "Recent changes unavailable",
  recentChangesPullRequest: "Open pull request",
  recentChangesTime: (value: string) => value,
};

interface RecentChangeFixture {
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

const FIRST_CHANGE: RecentChangeFixture = {
  eventId: "event-change-2",
  changedAt: "2026-07-13T01:24:00Z",
  namespace: "payments",
  resourceKind: "Deployment",
  resourceName: "checkout-api",
  imageBefore: "registry.example/checkout:v41",
  imageAfter: "registry.example/checkout:v42",
  pullRequestUrl: "https://github.com/example/checkout/pull/42",
  commitSha: "0123456789abcdef",
  repositoryId: "repository-checkout",
  repoRef: "refs/heads/main",
  workflowRunId: "workflow-run-42",
};

const SECOND_CHANGE: RecentChangeFixture = {
  eventId: "event-change-1",
  changedAt: "2026-07-13T01:18:00Z",
  namespace: "payments",
  resourceKind: "StatefulSet",
  resourceName: "ledger",
  imageBefore: null,
  imageAfter: "registry.example/ledger:v7",
  pullRequestUrl: null,
  commitSha: "fedcba9876543210",
  repositoryId: "repository-ledger",
  repoRef: "refs/heads/release",
  workflowRunId: "workflow-run-7",
};

describe("IssuesSurface recent changes", () => {
  it("does not render a region, card title, or empty placeholder after an empty response settles", async () => {
    const loadRecentChanges = vi.fn().mockResolvedValue(recentChangesPage([]));
    const port = issuesPort({ loadRecentChanges });

    renderSurface(
      <IssuesSurface
        clusterId="cluster-1"
        copy={RECENT_CHANGES_COPY}
        port={port}
        recoverySelection={{ state: "hidden" }}
      />,
    );

    fireEvent.click(await screen.findByRole("button", { name: "Elevated response latency" }));
    await waitFor(() => expect(loadRecentChanges).toHaveBeenCalledTimes(1));
    await screen.findByText("incident.detected");

    expect(screen.queryByRole("region", { name: "Recent changes" })).toBeNull();
    expect(screen.queryByRole("heading", { name: "Recent changes" })).toBeNull();
    expect(screen.queryByText("No recent changes")).toBeNull();
  });

  it("renders the server order as a native list with absolute times and only safe provided PR links", async () => {
    const loadRecentChanges = vi.fn().mockResolvedValue(
      recentChangesPage([FIRST_CHANGE, SECOND_CHANGE]),
    );
    const port = issuesPort({ loadRecentChanges });

    renderSurface(
      <IssuesSurface
        clusterId="cluster-1"
        copy={RECENT_CHANGES_COPY}
        port={port}
        recoverySelection={{ state: "hidden" }}
      />,
    );

    fireEvent.click(await screen.findByRole("button", { name: "Elevated response latency" }));
    const region = await screen.findByRole("region", { name: "Recent changes" });
    const list = within(region).getByRole("list");
    const items = Array.from(list.children);

    expect(list.tagName).toMatch(/^(OL|UL)$/);
    expect(items).toHaveLength(2);
    expect(items.every((item) => item.tagName === "LI")).toBe(true);
    expect(items[0]?.textContent).toContain("checkout-api");
    expect(items[1]?.textContent).toContain("ledger");
    expect(Array.from(region.querySelectorAll("time"), (time) => time.dateTime)).toEqual([
      "2026-07-13T01:24:00Z",
      "2026-07-13T01:18:00Z",
    ]);
    expect(items[0]?.textContent).toContain("registry.example/checkout:v41");
    expect(items[0]?.textContent).toContain("registry.example/checkout:v42");

    const links = within(region).getAllByRole("link", { name: "Open pull request" });
    expect(links).toHaveLength(1);
    expect(links[0]?.getAttribute("href")).toBe(
      "https://github.com/example/checkout/pull/42",
    );
    expect(links[0]?.getAttribute("target")).toBe("_blank");
    expect(links[0]?.getAttribute("rel")).toBe("noopener noreferrer");
    expect(loadRecentChanges).toHaveBeenCalledWith(
      "incident-1",
      expect.any(AbortSignal),
    );
  });

  it("isolates a recent-changes failure while detail and audit remain visible", async () => {
    const loadRecentChanges = vi.fn().mockRejectedValue(new IssuesPortFailure("unavailable"));
    const port = issuesPort({ loadRecentChanges });

    renderSurface(
      <IssuesSurface
        clusterId="cluster-1"
        copy={RECENT_CHANGES_COPY}
        port={port}
        recoverySelection={{ state: "hidden" }}
      />,
    );

    fireEvent.click(await screen.findByRole("button", { name: "Elevated response latency" }));

    expect(await screen.findByText("Recent changes unavailable")).toBeTruthy();
    expect(await screen.findAllByText("Memory pressure")).toHaveLength(2);
    expect(await screen.findByText("incident.detected")).toBeTruthy();
    expect(await screen.findByText("Root event")).toBeTruthy();
  });

  it("does not call the incident-scoped endpoint when the selected issue has no incident ID", async () => {
    const loadRecentChanges = vi.fn().mockResolvedValue(recentChangesPage([FIRST_CHANGE]));
    const issueWithoutIncident = issueFixture({ incidentId: null });
    const port = issuesPort({
      listIssues: vi.fn().mockResolvedValue({
        clusterId: "cluster-1",
        completeness: "unknown",
        dataQualityWarnings: [],
        excludedCount: 0,
        items: [issueWithoutIncident],
        limit: 50,
        limitReached: false,
        returned: 1,
      }),
      loadRecentChanges,
    });

    renderSurface(
      <IssuesSurface
        clusterId="cluster-1"
        copy={RECENT_CHANGES_COPY}
        port={port}
        recoverySelection={{ state: "hidden" }}
      />,
    );

    const issueButton = await screen.findByRole("button", {
      name: "Elevated response latency",
    });
    expect(issueButton.getAttribute("disabled")).not.toBeNull();
    fireEvent.click(issueButton);

    expect(loadRecentChanges).not.toHaveBeenCalled();
    expect(screen.queryByRole("region", { name: "Recent changes" })).toBeNull();
  });
});

function recentChangesPage(items: RecentChangeFixture[]) {
  return {
    incidentId: "incident-1",
    items,
    limit: 5,
  };
}

function issueFixture(overrides: Partial<IssueSummary> = {}): IssueSummary {
  return {
    id: "issue:workspace-1/correlation-1",
    workspaceId: "workspace-1",
    incidentId: "incident-1",
    correlationId: "correlation-1",
    clusterId: "cluster-1",
    namespace: "payments",
    resourceKind: "Deployment",
    resourceName: "checkout-api",
    symptom: "Elevated response latency",
    currentSubject: "deployment/payments/checkout-api",
    status: "investigating",
    rootCause: "Memory pressure",
    confidence: 0.86,
    supportingEvidence: ["restart spike"],
    missingEvidence: [],
    evidenceRef: "evidence-1",
    actionRoute: null,
    commandId: null,
    pullRequestUrl: null,
    errorReason: null,
    updatedAt: "2026-07-13T01:30:00Z",
    ...overrides,
  };
}

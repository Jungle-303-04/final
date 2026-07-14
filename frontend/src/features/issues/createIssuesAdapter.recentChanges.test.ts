import { describe, expect, it, vi } from "vitest";

import {
  createIssuesAdapter,
  type IssuesEndpointDependencies,
} from "./createIssuesAdapter";
import { IssuesPortFailure } from "./issuesContract";

const RECENT_CHANGES = {
  incident_id: "incident-1",
  items: [{
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
  }],
  limit: 5,
};

describe("createIssuesAdapter recent changes", () => {
  it("forwards the incident, default limit, and AbortSignal to the verified endpoint", async () => {
    const controller = new AbortController();
    const dependencies = endpoints();
    const port = createIssuesAdapter(dependencies);

    await expect(
      port.loadRecentChanges("incident-1", controller.signal),
    ).resolves.toMatchObject({
      incidentId: "incident-1",
      limit: 5,
      items: [{ eventId: "event-change-1" }],
    });
    expect(dependencies.getIncidentRecentChanges).toHaveBeenCalledWith(
      "incident-1",
      { limit: 5, signal: controller.signal },
    );
  });

  it("rejects a blank incident before calling the endpoint", async () => {
    const dependencies = endpoints();
    const port = createIssuesAdapter(dependencies);

    await expect(port.loadRecentChanges(" ")).rejects.toMatchObject({
      code: "invalid-request",
    } satisfies Partial<IssuesPortFailure>);
    expect(dependencies.getIncidentRecentChanges).not.toHaveBeenCalled();
  });

  it("preserves a concealed incident as a not-found port failure", async () => {
    const notFound = Object.assign(new Error("not found"), {
      kind: "not-found",
      status: 404,
    });
    const port = createIssuesAdapter(endpoints({
      getIncidentRecentChanges: vi.fn().mockRejectedValue(notFound),
    }));

    await expect(port.loadRecentChanges("incident-missing")).rejects.toMatchObject({
      code: "not-found",
    } satisfies Partial<IssuesPortFailure>);
  });

  it("preserves AbortError identity", async () => {
    const abort = new DOMException("Aborted", "AbortError");
    const port = createIssuesAdapter(endpoints({
      getIncidentRecentChanges: vi.fn().mockRejectedValue(abort),
    }));

    await expect(port.loadRecentChanges("incident-1")).rejects.toBe(abort);
  });

  it("maps a canonical response mismatch to invalid-response", async () => {
    const port = createIssuesAdapter(endpoints({
      getIncidentRecentChanges: vi.fn().mockResolvedValue({
        ...RECENT_CHANGES,
        incident_id: "incident-other",
      }),
    }));

    await expect(port.loadRecentChanges("incident-1")).rejects.toMatchObject({
      code: "invalid-response",
    } satisfies Partial<IssuesPortFailure>);
  });
});

function endpoints(
  overrides: Partial<IssuesEndpointDependencies> = {},
): IssuesEndpointDependencies {
  return {
    listRcaTimeline: vi.fn(),
    getRcaIncident: vi.fn(),
    listEvidence: vi.fn(),
    listRcaReports: vi.fn(),
    getAuditTimeline: vi.fn(),
    getIncidentRecentChanges: vi.fn().mockResolvedValue(RECENT_CHANGES),
    getRecoveryPlanByCorrelation: vi.fn(),
    selectRecoveryAction: vi.fn(),
    ...overrides,
  };
}

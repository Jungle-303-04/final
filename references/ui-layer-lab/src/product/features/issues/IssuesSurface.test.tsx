// @vitest-environment jsdom
import type { ReactElement } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { IssuesSurface } from "./IssuesSurface";
import { IssuesPortFailure, type IssuesPort, type IssueSummary } from "./issuesContract";
import type { IssuesSurfaceCopy } from "./issuesSurfaceContract";
afterEach(cleanup);
const issue: IssueSummary = {
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
};
describe("IssuesSurface", () => {
  it("keeps incident, evidence, analysis, and recovery loads independently observable", async () => {
    const port = issuesPort();
    renderSurface(
      <IssuesSurface
        clusterId="cluster-1"
        copy={COPY}
        port={port}
        recoverySelection={{ state: "enabled" }}
      />,
    );
    fireEvent.click(await screen.findByRole("button", { name: "Elevated response latency" }));
    expect(await screen.findAllByText("Memory pressure")).toHaveLength(2);
    expect(await screen.findByText("Pod restart and OOMKilled events")).toBeTruthy();
    expect(await screen.findByText("Increase the memory limit after approval")).toBeTruthy();
    expect(await screen.findByRole("button", { name: "Increase memory limit" })).toBeTruthy();
    expect(port.loadIssue).toHaveBeenCalledWith("incident-1", "cluster-1", expect.any(AbortSignal));
    expect(port.loadEvidence).toHaveBeenCalledWith(
      "correlation-1",
      {},
      expect.any(AbortSignal),
    );
    expect(port.loadReports).toHaveBeenCalledWith(
      "correlation-1",
      {},
      expect.any(AbortSignal),
    );
    expect(port.loadRecoveryPlan).toHaveBeenCalledWith(
      "correlation-1",
      expect.any(AbortSignal),
    );
  });
  it("shows a receipt then refreshes from the server without optimistic selection", async () => {
    const port = issuesPort();
    renderSurface(
      <IssuesSurface
        clusterId="cluster-1"
        copy={COPY}
        port={port}
        recoverySelection={{ state: "enabled" }}
      />,
    );
    fireEvent.click(await screen.findByRole("button", { name: "Elevated response latency" }));
    fireEvent.click(await screen.findByRole("button", { name: "Increase memory limit" }));
    expect(await screen.findByText("Selection received · event-1")).toBeTruthy();
    await waitFor(() => expect(port.loadRecoveryPlan).toHaveBeenCalledTimes(2));
    expect(port.selectRecoveryAction).toHaveBeenCalledWith({
      correlationId: "correlation-1",
      planId: "plan-1",
      actionId: "increase-memory",
    }, expect.any(AbortSignal));
    expect(screen.getByText("selection_requested")).toBeTruthy();
  });
  it("renders a section failure without removing successful incident content", async () => {
    const port = issuesPort({
      loadEvidence: vi.fn().mockRejectedValue(new IssuesPortFailure("forbidden")),
    });
    renderSurface(
      <IssuesSurface
        clusterId="cluster-1"
        copy={COPY}
        port={port}
        recoverySelection={{ state: "enabled" }}
      />,
    );
    fireEvent.click(await screen.findByRole("button", { name: "Elevated response latency" }));
    expect(await screen.findAllByText("Memory pressure")).toHaveLength(2);
    expect(await screen.findByText("Evidence unavailable")).toBeTruthy();
    expect(await screen.findByText("Increase the memory limit after approval")).toBeTruthy();
  });
  it("disables recovery mutation when capability is not allowed", async () => {
    const port = issuesPort();
    renderSurface(
      <IssuesSurface
        clusterId="cluster-1"
        copy={COPY}
        port={port}
        recoverySelection={{ state: "disabled", reason: "Read-only target" }}
      />,
    );
    fireEvent.click(await screen.findByRole("button", { name: "Elevated response latency" }));
    const action = await screen.findByRole("button", { name: "Increase memory limit" });
    expect(action.getAttribute("disabled")).not.toBeNull();
    expect(screen.getByText("Read-only target")).toBeTruthy();
    expect(port.selectRecoveryAction).not.toHaveBeenCalled();
  });
  it("hides a recovery mutation that is not meaningful for the target", async () => {
    const port = issuesPort();
    renderSurface(
      <IssuesSurface
        clusterId="cluster-1"
        copy={COPY}
        port={port}
        recoverySelection={{ state: "hidden" }}
      />,
    );
    fireEvent.click(await screen.findByRole("button", { name: "Elevated response latency" }));
    await screen.findByText("selection_requested");
    expect(screen.queryByRole("button", { name: "Increase memory limit" })).toBeNull();
    expect(port.selectRecoveryAction).not.toHaveBeenCalled();
  });
});
function issuesPort(overrides: Partial<IssuesPort> = {}): IssuesPort {
  return {
    listIssues: vi.fn().mockResolvedValue({
      clusterId: "cluster-1",
      completeness: "unknown",
      dataQualityWarnings: [],
      excludedCount: 0,
      items: [issue],
      limit: 50,
      limitReached: false,
      returned: 1,
    }),
    loadIssue: vi.fn().mockResolvedValue({
      ...issue,
      requestedClusterId: "cluster-1",
      requestedIncidentId: "incident-1",
      dataQualityWarnings: [],
      missingEvidence: [],
      supportingEvidence: ["restart spike"],
    }),
    loadEvidence: vi.fn().mockResolvedValue({
      correlationId: "correlation-1",
      items: [{
        id: "evidence:workspace-1/7",
        correlationId: "correlation-1",
        kind: "incident.evidence",
        clusterId: "cluster-1",
        evidenceRef: "evidence-1",
        summary: "Evidence collected",
        sources: [{
          source: "kubernetes",
          summary: "Pod restart and OOMKilled events",
          schemaVersion: 1,
          collector: "cluster-agent",
          collectorVersion: "1.0.0",
          sourceVersion: null,
          queryVersion: null,
          collectedAt: null,
          evidenceKey: "kubernetes",
          sourceId: null,
          agentId: "agent-1",
          windowStart: null,
        }],
        createdAt: null,
      }],
      limit: 50,
      offset: 0,
      hasMore: false,
      nextCursor: null,
    }),
    loadReports: vi.fn().mockResolvedValue({
      correlationId: "correlation-1",
      items: [{
        id: "rca-report:workspace-1/11",
        correlationId: "correlation-1",
        incidentId: "incident-1",
        clusterId: "cluster-1",
        namespace: "payments",
        resourceKind: "Deployment",
        resourceName: "checkout-api",
        rootCause: "Memory pressure",
        action: "Increase the memory limit after approval",
        symptom: null,
        severity: "warning",
        confidence: 0.86,
        reason: null,
        evidenceRef: "evidence-1",
        supportingEvidence: [],
        missingEvidence: [],
        secondarySymptoms: [],
        selectedCandidateId: null,
        candidates: [],
        supportingEvidenceRefs: [],
        missingEvidenceChecks: [],
        createdAt: null,
      }],
      limit: 50,
      offset: 0,
      hasMore: false,
      nextCursor: null,
    }),
    loadRecoveryPlan: vi.fn().mockResolvedValue({
      id: "plan-1",
      correlationId: "correlation-1",
      incidentId: "incident-1",
      evidenceRef: "evidence-1",
      status: "selection_requested",
      summary: "Choose a safe action",
      recommendedActionId: "increase-memory",
      executionRoute: "approval",
      selectionRequired: true,
      selectedActionId: null,
      selectedBy: null,
      selectedAction: null,
      candidates: [{
        id: "increase-memory",
        title: "Increase memory limit",
        description: "Raise the Deployment memory limit",
        route: "deployment.patch",
        rank: 1,
        score: 0.86,
        riskLevel: "medium",
        blastRadius: "one Deployment",
        approvalRequired: true,
        prerequisites: [],
        validationChecks: [],
        rollbackPlan: "Restore the previous limit",
        evidenceRefs: [],
      }],
    }),
    selectRecoveryAction: vi.fn().mockResolvedValue({
      kind: "accepted",
      receipt: {
        accepted: true,
        eventId: "event-1",
        correlationId: "correlation-1",
      },
    }),
    ...overrides,
  };
}
const COPY: IssuesSurfaceCopy = {
  listLabel: "Incidents",
  listEmpty: "No incidents",
  listLoading: "Loading incidents",
  detailLabel: "Incident detail",
  detailEmpty: "Select an incident",
  detailLoading: "Loading incident detail",
  evidenceLabel: "Evidence",
  reportsLabel: "Analysis",
  recoveryLabel: "Recovery",
  sectionLoading: "Loading section",
  sectionEmpty: "No data",
  evidenceUnavailable: "Evidence unavailable",
  reportsUnavailable: "Analysis unavailable",
  recoveryUnavailable: "Recovery unavailable",
  refresh: "Refresh",
  status: "Status",
  rootCause: "Root cause",
  recommended: "Recommended",
  approvalRequired: "Approval required",
  selectionPending: "Submitting selection",
  selectionReceived: (eventId) => `Selection received · ${eventId}`,
  genericFailure: "Unable to load",
  failureDetail: (code) => code,
  partial: (excludedCount) => `Partial · ${excludedCount}`,
};
function renderSurface(element: ReactElement) {
  return render(element);
}

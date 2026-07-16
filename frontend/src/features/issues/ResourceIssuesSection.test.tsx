// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { I18nProvider } from "../../shared/i18n";
import type { ResourceIssuesFrame } from "../../pages/resources/useResourceIssuesDataFrame";
import { ResourceIssuesSection } from "./ResourceIssuesSection";

afterEach(cleanup);

describe("ResourceIssuesSection", () => {
  it("renders server-ranked issues as collapsed accessible rows", () => {
    render(
      <I18nProvider navigatorLanguage="en-US" storage={null}>
        <ResourceIssuesSection frame={READY_FRAME} />
      </I18nProvider>,
    );

    expect(screen.getByRole("heading", { name: "Issues (1)" })).toBeTruthy();
    const details = screen.getByText("Unavailable replicas").closest("details");
    expect(details?.hasAttribute("open")).toBe(false);
    expect(screen.getByText("Critical")).toBeTruthy();
    expect(screen.getByText("A prior healthy-to-failing transition has not been verified."))
      .toBeTruthy();
    expect(screen.queryByText("checkout-api")).toBeNull();
  });
});

const READY_FRAME: ResourceIssuesFrame = {
  phase: "ready",
  failure: null,
  data: {
    scope: {
      workspaceId: "workspace-1",
      clusterId: "cluster-1",
      namespaces: ["target"],
      freshness: "live",
    },
    coverageAvailability: "available",
    observedAt: "2026-07-16T05:00:00Z",
    reasonCodes: [],
    hasMore: false,
    limit: 25,
    items: [{
      id: "workspace-1:corr-1",
      workspaceId: "workspace-1",
      incidentId: "incident-1",
      correlationId: "corr-1",
      clusterId: "cluster-1",
      namespace: "target",
      resourceKind: "Deployment",
      resourceName: "checkout-api",
      symptom: "Unavailable replicas",
      currentSubject: "incident.detected",
      status: "incident_detected",
      severity: "critical",
      severityAvailability: "available",
      rootCause: "readiness probe failure",
      confidence: null,
      supportingEvidence: [],
      missingEvidence: [],
      evidenceRef: null,
      actionRoute: null,
      commandId: null,
      pullRequestUrl: null,
      errorReason: null,
      updatedAt: "2026-07-16T05:01:00Z",
      onset: {
        firstObservedAt: "2026-07-16T05:00:00Z",
        source: "timeline_created_at",
        timingKind: null,
        timingAvailability: "unavailable",
        timingReasonCode: "health_transition_evidence_unavailable",
      },
    }],
  },
};

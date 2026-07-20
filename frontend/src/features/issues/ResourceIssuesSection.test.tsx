// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { MemoryRouter, useLocation } from "react-router-dom";

import { I18nProvider } from "../../shared/i18n";
import type { ResourceIssuesFrame } from "../../pages/resources/useResourceIssuesDataFrame";
import { ResourceIssuesSection } from "./ResourceIssuesSection";

afterEach(cleanup);

describe("ResourceIssuesSection", () => {
  it("renders server-ranked issues as collapsed accessible rows", () => {
    render(
      <I18nProvider navigatorLanguage="en-US" storage={null}>
        <MemoryRouter>
          <ResourceIssuesSection frame={READY_FRAME} />
        </MemoryRouter>
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

  it("opens the selected incident in the scoped issues SPA route", () => {
    render(
      <I18nProvider navigatorLanguage="en-US" storage={null}>
        <MemoryRouter initialEntries={["/resources?clusters=cluster-1"]}>
          <ResourceIssuesSection frame={READY_FRAME} />
          <LocationProbe />
        </MemoryRouter>
      </I18nProvider>,
    );

    const link = screen.getByRole("link");
    expect(link.getAttribute("href"))
      .toBe("/issues?clusters=cluster-1&detail=incident-1");
    fireEvent.click(link);
    expect(screen.getByTestId("location").textContent)
      .toBe("/issues?clusters=cluster-1&detail=incident-1");
  });
});

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location">{location.pathname}{location.search}</output>;
}

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

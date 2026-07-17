// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { UnifiedFilterProvider } from "../../features/filters/UnifiedFilterProvider";
import type { TimelineEvent } from "../../features/timeline/timelineContract";
import { I18nProvider } from "../../shared/i18n";
import { TimelineEventDetailSheet } from "./TimelineEventDetailSheet";

describe("TimelineEventDetailSheet RCA context", () => {
  it("uses the exact incident and correlation from the selected event", async () => {
    const load = vi.fn().mockResolvedValue({
      state: "available",
      scope: event.scope,
      coverageAvailability: "available",
      reasonCodes: [],
      record: {
        issue: issue(),
        report: null,
        rootCause: "memory limit exceeded",
        impact: "checkout requests failed",
        evidence: ["container terminated"],
        missingEvidence: [],
      },
    });
    render(
      <I18nProvider navigatorLanguage="en-US" storage={null}>
        <MemoryRouter>
          <UnifiedFilterProvider>
            <TimelineEventDetailSheet
              event={event}
              formatDate={() => "Jul 18, 2026"}
              onClose={vi.fn()}
              onNavigate={vi.fn()}
              pins={null}
              rcaContextPort={{ load }}
              t={(key) => key}
            />
          </UnifiedFilterProvider>
        </MemoryRouter>
      </I18nProvider>,
    );

    expect(await screen.findByText("checkout requests failed")).toBeTruthy();
    expect(load).toHaveBeenCalledWith({
      kind: "incident",
      scope: event.scope,
      incidentId: "incident-a",
      correlationId: "correlation-a",
    }, expect.any(AbortSignal));
  });
});

const event: TimelineEvent = {
  id: "event-a",
  source: "incident",
  sourceKey: "incident:event-a",
  nativeId: "event-a",
  activity: "unhealthy",
  occurredAt: "2026-07-18T01:00:00Z",
  scope: {
    workspaceId: "workspace-a",
    clusterId: "cluster-a",
    namespaces: ["shop"],
    freshness: "live",
  },
  subject: { kind: "incident", incidentId: "incident-a", correlationId: "correlation-a" },
  resource: null,
  type: "incident",
  severity: "critical",
  title: "checkout incident",
  owner: null,
  metadata: {},
};

function issue() {
  return {
    id: "workspace-a:correlation-a",
    incidentId: "incident-a",
    correlationId: "correlation-a",
    workspaceId: "workspace-a",
    clusterId: "cluster-a",
    namespace: "shop",
    resourceKind: "Deployment",
    resourceName: "checkout",
    symptom: "unavailable replicas",
    currentSubject: "rca.completed",
    status: "rca_completed",
    rootCause: "memory limit exceeded",
    confidence: 0.95,
    supportingEvidence: ["container terminated"],
    missingEvidence: [],
    evidenceRef: "evidence://bundle",
    actionRoute: null,
    commandId: null,
    pullRequestUrl: null,
    errorReason: null,
    updatedAt: "2026-07-18T01:00:00Z",
  };
}

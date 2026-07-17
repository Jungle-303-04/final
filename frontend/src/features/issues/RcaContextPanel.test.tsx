// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";

import { UnifiedFilterProvider } from "../filters/UnifiedFilterProvider";
import { I18nProvider } from "../../shared/i18n";
import type { RcaContextPort, RcaContextResult } from "./rcaContextContract";
import { RcaContextPanel } from "./RcaContextPanel";

const scope = {
  workspaceId: "workspace-a",
  clusterId: "cluster-a",
  namespaces: ["shop"],
  freshness: "live" as const,
};
const subject = {
  kind: "resource" as const,
  scope,
  resource: {
    apiGroup: "apps",
    version: "v1",
    kind: "Deployment",
    namespace: "shop",
    name: "checkout",
    uid: "deployment-uid",
  },
};

afterEach(() => cleanup());

describe("RcaContextPanel", () => {
  it("renders verified cause, impact and evidence with an exact scoped issue link", async () => {
    renderPanel({
      state: "available",
      scope,
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

    expect(await screen.findByText("memory limit exceeded")).toBeTruthy();
    expect(screen.getByText("checkout requests failed")).toBeTruthy();
    expect(screen.getByText("• container terminated")).toBeTruthy();
    const href = screen.getByRole("link", { name: "Open related issue" }).getAttribute("href") ?? "";
    expect(href).toContain("/issues?");
    expect(href).toContain("clusters=cluster-a");
    expect(href).toContain("namespaces=cluster-a%2Fshop");
  });

  it("does not create a panel for a verified empty result", async () => {
    renderPanel({
      state: "empty",
      scope,
      coverageAvailability: "available",
      reasonCodes: [],
      record: null,
    });

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(screen.queryByText("Related cause and impact")).toBeNull();
  });

  it("localizes incomplete coverage without fabricating a cause card", async () => {
    renderPanel({
      state: "empty",
      scope,
      coverageAvailability: "partial",
      reasonCodes: ["coverage_partial"],
      record: null,
    }, "ko-KR");

    expect(await screen.findByText("이 정확한 범위의 연관 이슈 수집 범위가 불완전합니다.")).toBeTruthy();
    expect(screen.queryByText("연결된 원인과 영향")).toBeNull();
  });

  it("builds the exact scoped issue link without requiring a global filter provider", async () => {
    renderPanel({
      state: "available",
      scope,
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
    }, "en-US", false);

    const href = (await screen.findByRole("link", { name: "Open related issue" })).getAttribute("href") ?? "";
    expect(href).toContain("clusters=cluster-a");
    expect(href).toContain("namespaces=cluster-a%2Fshop");
  });
});

function renderPanel(
  result: RcaContextResult,
  navigatorLanguage = "en-US",
  withFilterProvider = true,
) {
  const port: RcaContextPort = { load: async () => result };
  const panel = <RcaContextPanel port={port} subject={subject} />;
  return render(
    <I18nProvider navigatorLanguage={navigatorLanguage} storage={null}>
      <MemoryRouter initialEntries={["/gitops/resource?clusters=cluster-other"]}>
        {withFilterProvider ? <UnifiedFilterProvider>{panel}</UnifiedFilterProvider> : panel}
      </MemoryRouter>
    </I18nProvider>,
  );
}

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

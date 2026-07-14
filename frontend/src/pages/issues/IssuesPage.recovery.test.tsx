// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { MemoryRouter } from "react-router-dom";

import { AuthSessionGateProvider } from "../../features/auth/AuthSessionGate";
import { ClusterScopeProvider } from "../../features/cluster-scope/ClusterScopeProvider";
import type { ClusterScopePort } from "../../features/cluster-scope/clusterScopeContract";
import { UnifiedFilterProvider } from "../../features/filters/UnifiedFilterProvider";
import { issuesPort } from "../../features/issues/IssuesSurface.testSupport";
import { I18nProvider } from "../../shared/i18n";
import { IssuesPage } from "./IssuesPage";

afterEach(cleanup);

describe("IssuesPage recovery approval", () => {
  it("submits a selected recovery candidate from the product page", async () => {
    const port = issuesPort();
    render(
      <I18nProvider navigatorLanguage="ko-KR" storage={null}>
        <MemoryRouter initialEntries={["/issues?clusters=cluster-1"]}>
          <AuthSessionGateProvider reportUnauthorized={() => undefined}>
            <UnifiedFilterProvider>
              <ClusterScopeProvider authorityKey="default:user" port={clusterScopePort}>
                <IssuesPage port={port} />
              </ClusterScopeProvider>
            </UnifiedFilterProvider>
          </AuthSessionGateProvider>
        </MemoryRouter>
      </I18nProvider>,
    );

    fireEvent.click(await screen.findByRole("button", { name: "Elevated response latency" }));
    fireEvent.click(await screen.findByRole("button", { name: "Increase memory limit" }));

    await waitFor(() => expect(port.selectRecoveryAction).toHaveBeenCalledWith({
      actionId: "increase-memory",
      correlationId: "correlation-1",
      planId: "plan-1",
    }, expect.any(AbortSignal)));
  });
});

const clusterScopePort: ClusterScopePort = {
  listClusterChoices: async () => ({
    completeness: "unknown",
    clusters: [{
      id: "cluster-1",
      workspaceId: "default",
      name: "cluster-1",
      environment: "production",
      provider: "eks",
      connectionStage: null,
      registrationState: "active",
      connectionState: "online",
      lastObservedAt: "2026-07-14T00:00:00.000Z",
      nodeCount: 1,
      podCount: 1,
      incidentCount: 1,
    }],
  }),
};

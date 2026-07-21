// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";

import { AuthSessionGateProvider } from "../../features/auth/AuthSessionGate";
import { ClusterScopeProvider } from "../../features/cluster-scope/ClusterScopeProvider";
import type { ClusterScopePort } from "../../features/cluster-scope/clusterScopeContract";
import { UnifiedFilterProvider } from "../../features/filters/UnifiedFilterProvider";
import { issuesPort } from "../../features/issues/IssuesSurface.testSupport";
import { I18nProvider } from "../../shared/i18n";
import { IssuesPage } from "./IssuesPage";
import type { ChecksPort } from "../../features/checks/checksContract";

afterEach(cleanup);

describe("IssuesPage recovery approval", () => {
  it("loads all incidents when no cluster filter is selected", async () => {
    const port = issuesPort();
    render(
      <I18nProvider navigatorLanguage="ko-KR" storage={null}>
        <MemoryRouter initialEntries={["/issues"]}>
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

    expect(await screen.findByRole(
      "button",
      { name: "Elevated response latency" },
      { timeout: 5_000 },
    )).toBeTruthy();
    expect(port.listIssues).toHaveBeenCalledWith(null, 50, expect.any(AbortSignal));
  });

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

    fireEvent.click(await screen.findByRole(
      "button",
      { name: "Elevated response latency" },
      { timeout: 5_000 },
    ));
    fireEvent.click(await screen.findByRole(
      "button",
      { name: "Increase memory limit" },
      { timeout: 5_000 },
    ));

    await waitFor(() => expect(port.selectRecoveryAction).toHaveBeenCalledWith({
      actionId: "increase-memory",
      correlationId: "correlation-1",
      planId: "plan-1",
    }, expect.any(AbortSignal)));
  });

  it("renders operational status and common RCA causes as user-facing Korean", async () => {
    const baseline = issuesPort();
    const list = await baseline.listIssues("cluster-1", 50);
    const detail = await baseline.loadIssue("incident-1", "cluster-1");
    const localizedIssue = {
      ...list.items[0]!,
      status: "approval_recommended",
      rootCause: "oom_killed",
    };
    const port = issuesPort({
      listIssues: async () => ({ ...list, items: [localizedIssue] }),
      loadIssue: async () => ({
        ...detail,
        status: "approval_recommended",
        rootCause: "oom_killed",
      }),
    });
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

    const row = await screen.findByRole("button", { name: "Elevated response latency" });
    expect(screen.getAllByText("복구 승인 검토 필요").length).toBeGreaterThan(0);
    expect(screen.getByText("메모리 한도 초과로 종료")).toBeTruthy();
    fireEvent.click(row);
    expect((await screen.findAllByText("복구 승인 검토 필요")).length).toBeGreaterThan(1);
    expect((await screen.findAllByText("메모리 한도 초과로 종료")).length).toBeGreaterThan(1);
    expect(screen.queryByText("approval_recommended")).toBeNull();
    expect(screen.queryByText("oom_killed")).toBeNull();
  });

  it("integrates active incidents, RCA, and preventive checks in one workspace", async () => {
    const port = issuesPort();
    const checksPort: ChecksPort = {
      getOverview: vi.fn().mockResolvedValue({
        scopeCoverage: {
          availability: "available",
          scopes: [{
            workspaceId: "default",
            clusterId: "cluster-1",
            namespaces: [],
            freshness: "live",
          }],
          observedAt: "2026-07-22T00:00:00Z",
          reasonCodes: [],
        },
        resultSet: {
          availability: "unavailable",
          evaluatedAt: null,
          checks: null,
          totalCheckCount: null,
          totalFindingCount: null,
          reasonCodes: ["checks_result_projection_not_integrated"],
        },
        catalog: {
          availability: "unavailable",
          entries: null,
          reasonCodes: ["checks_catalog_not_integrated"],
        },
      }),
      getDetail: vi.fn(),
    };
    render(
      <I18nProvider navigatorLanguage="ko-KR" storage={null}>
        <MemoryRouter initialEntries={["/issues?clusters=cluster-1&view=checks"]}>
          <AuthSessionGateProvider reportUnauthorized={() => undefined}>
            <UnifiedFilterProvider>
              <ClusterScopeProvider authorityKey="default:user" port={clusterScopePort}>
                <IssuesPage checksPort={checksPort} port={port} />
              </ClusterScopeProvider>
            </UnifiedFilterProvider>
          </AuthSessionGateProvider>
        </MemoryRouter>
      </I18nProvider>,
    );

    expect(await screen.findByRole("tab", { name: "예방 점검", selected: true })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "진행 중" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "RCA" })).toBeTruthy();
    await waitFor(() => expect(checksPort.getOverview).toHaveBeenCalledWith({
      clusterIds: ["cluster-1"],
      namespaces: [],
    }, expect.any(AbortSignal)));

    fireEvent.click(screen.getByRole("tab", { name: "RCA" }));
    expect(await screen.findByRole("button", { name: "Elevated response latency" })).toBeTruthy();
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

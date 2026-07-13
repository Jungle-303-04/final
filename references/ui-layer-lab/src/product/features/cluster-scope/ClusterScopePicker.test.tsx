// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { AuthSessionGateProvider } from "../auth/AuthSessionGate";
import type { HomeClusterChoice } from "../home/homeContract";
import { I18nProvider } from "../../shared/i18n";
import type { ClusterScopePort } from "./clusterScopeContract";
import { ClusterScopePicker } from "./ClusterScopePicker";
import { ClusterScopeProvider } from "./ClusterScopeProvider";

afterEach(cleanup);

describe("ClusterScopePicker", () => {
  it.each([
    ["en-US", "Cluster prod-cluster · Production · cluster-a · Connected", "Available clusters"],
    ["ko-KR", "Cluster prod-cluster · Production · cluster-a · 연결됨", "조회 가능한 Cluster"],
  ])("localizes picker chrome for %s without translating canonical cluster data", async (
    language,
    accessibleName,
    groupLabel,
  ) => {
    const user = userEvent.setup();
    renderPicker(language);

    const trigger = await screen.findByRole("combobox", { name: accessibleName });
    expect(trigger.textContent).toContain("prod-cluster · Production · cluster-a");
    expect(trigger.querySelector("[data-slot='cluster-provider-icon']")?.getAttribute("data-provider"))
      .toBe("eks");
    trigger.focus();
    await user.keyboard("{ArrowDown}");

    expect(await screen.findByText(groupLabel)).toBeTruthy();
    expect(screen.getByRole("option", { name: /edge-cluster/u })).toBeTruthy();
    expect(screen.getByRole("img", { name: /On-premises Kubernetes|온프레미스 Kubernetes/u }))
      .toBeTruthy();
    expect(screen.queryByText("Amazon EKS")).toBeNull();
    expect(screen.queryByText("Critical")).toBeNull();
  });

  it("shows explicit unknown scope honestly instead of selecting a fallback", async () => {
    renderPicker("en-US", "/product?cluster=missing");

    const trigger = await screen.findByRole("combobox", {
      name: "Cluster Current scope unavailable: missing · Unknown",
    });
    await waitFor(() => expect(trigger.getAttribute("aria-invalid")).toBe("true"));
    expect(trigger.textContent).toContain("Current scope unavailable: missing");
  });

  it("exposes the selected cluster freshness through the global picker tooltip", async () => {
    renderPicker("ko-KR");

    const trigger = await screen.findByRole("combobox", {
      name: /Cluster prod-cluster.*연결됨/u,
    });
    trigger.focus();

    await waitFor(() => {
      expect(document.querySelector("[data-slot='tooltip-content']")?.textContent)
        .toMatch(/마지막 관측/u);
    });
  });
});

function renderPicker(language: string, entry = "/product?cluster=cluster-a") {
  const canonicalClusters = [
    {
      ...cluster("cluster-a", "prod-cluster", "Production", "online", "eks"),
      health: "Critical",
    },
    {
      ...cluster("cluster-b", "edge-cluster", "Edge", "offline", "onprem"),
      health: "Healthy",
    },
  ];
  const port: ClusterScopePort = {
    listClusterChoices: vi.fn(async () => ({
      completeness: "unknown" as const,
      clusters: canonicalClusters,
    })),
  };

  return render(
    <I18nProvider navigatorLanguage={language} storage={null}>
      <MemoryRouter initialEntries={[entry]}>
        <AuthSessionGateProvider reportUnauthorized={() => undefined}>
          <ClusterScopeProvider authorityKey="workspace-a:user-a" port={port}>
            <ClusterScopePicker />
          </ClusterScopeProvider>
        </AuthSessionGateProvider>
      </MemoryRouter>
    </I18nProvider>,
  );
}

function cluster(
  id: string,
  name: string,
  environment: string,
  connectionState: HomeClusterChoice["connectionState"],
  provider: HomeClusterChoice["provider"],
): HomeClusterChoice {
  return {
    id,
    workspaceId: "workspace-a",
    name,
    environment,
    provider,
    registrationState: "active",
    connectionState,
    lastObservedAt: "2026-07-13T00:00:00.000Z",
    nodeCount: 2,
    podCount: 6,
    incidentCount: 0,
  };
}

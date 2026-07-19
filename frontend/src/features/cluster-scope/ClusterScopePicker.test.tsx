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
import { UnifiedFilterProvider } from "../filters/UnifiedFilterProvider";

afterEach(cleanup);

describe("ClusterScopePicker", () => {
  it.each([
    ["en-US", "Cluster prod-cluster · Production · cluster-a · Connected · Ready", "Available clusters"],
    ["ko-KR", "Cluster prod-cluster · Production · cluster-a · 연결됨 · Ready", "조회 가능한 Cluster"],
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
    renderPicker("en-US", "/?clusters=missing");

    const trigger = await screen.findByRole("combobox", {
      name: "Current scope unavailable: missing",
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
        .toMatch(/연결 단계.*Ready.*마지막 관측/u);
    });
  });

  it("keeps an unfiltered scope explicit without fabricating connection metadata", async () => {
    renderPicker("en-US", "/");

    const trigger = await screen.findByRole("combobox", { name: "All clusters" });
    trigger.focus();

    await waitFor(() => {
      const tooltip = document.querySelector("[data-slot='tooltip-content']")?.textContent ?? "";
      expect(tooltip).toBe("All clusters");
      expect(tooltip).not.toMatch(/Unknown|Last observed/u);
    });
  });

  it("adds a Cluster to the existing OR selection and can clear the axis", async () => {
    const user = userEvent.setup();
    renderPicker("en-US");

    const trigger = await screen.findByRole("combobox", {
      name: "Cluster prod-cluster · Production · cluster-a · Connected · Ready",
    });
    await user.click(trigger);
    await user.click(await screen.findByRole("option", { name: /edge-cluster/u }));
    expect(await screen.findByRole("combobox", { name: "2 clusters selected" })).toBeTruthy();

    await user.click(screen.getByRole("combobox", { name: "2 clusters selected" }));
    await user.click(await screen.findByRole("option", { name: "All clusters" }));
    expect(await screen.findByRole("combobox", { name: "All clusters" })).toBeTruthy();
  });

  it("omits connection-stage copy when the optional field is absent", async () => {
    renderPicker("en-US", "/?clusters=cluster-a", null);

    const trigger = await screen.findByRole("combobox", {
      name: "Cluster prod-cluster · Production · cluster-a · Connected",
    });
    trigger.focus();

    await waitFor(() => {
      const tooltip = document.querySelector("[data-slot='tooltip-content']")?.textContent ?? "";
      expect(tooltip).toMatch(/Last observed/u);
      expect(tooltip).not.toMatch(/Connection stage|Ready/u);
    });
  });
});

function renderPicker(
  language: string,
  entry = "/?clusters=cluster-a",
  connectionStage: "ready" | null = "ready",
) {
  const canonicalClusters: HomeClusterChoice[] = [
    {
      ...cluster("cluster-a", "prod-cluster", "Production", "online", "eks", connectionStage),
      health: "critical",
    },
    {
      ...cluster("cluster-b", "edge-cluster", "Edge", "offline", "onprem", connectionStage),
      health: "healthy",
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
          <UnifiedFilterProvider>
            <ClusterScopeProvider authorityKey="workspace-a:user-a" port={port}>
              <ClusterScopePicker />
            </ClusterScopeProvider>
          </UnifiedFilterProvider>
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
  connectionStage: "ready" | null,
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
    connectionStage,
  };
}

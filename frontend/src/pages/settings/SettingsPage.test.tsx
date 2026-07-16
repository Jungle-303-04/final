// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "next-themes";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";

import { ProductSessionProvider } from "../../features/auth/ProductSessionContext";
import { AuthSessionGateProvider } from "../../features/auth/AuthSessionGate";
import { ClusterScopeProvider } from "../../features/cluster-scope/ClusterScopeProvider";
import type { ClusterScopePort } from "../../features/cluster-scope/clusterScopeContract";
import { UnifiedFilterProvider } from "../../features/filters/UnifiedFilterProvider";
import type { SettingsPort } from "../../features/settings/settingsContract";
import type { ShellStatePort } from "../../features/shell-state/shellStateContract";
import { I18nProvider } from "../../shared/i18n";
import { SettingsPage } from "./SettingsPage";

beforeEach(() => {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("SettingsPage", () => {
  it("shows verified session and cluster data before navigating to unavailable administration contracts", async () => {
    const user = userEvent.setup();
    renderSettings("/settings");

    expect(screen.getByRole("heading", { name: "설정", level: 2 })).toBeTruthy();
    expect(screen.getByText("default")).toBeTruthy();
    expect(screen.getByText("Woo Nyong")).toBeTruthy();
    expect(screen.getByText("woonyong.kr@gmail.com")).toBeTruthy();
    await waitFor(() => expect(screen.getByText("표시 가능한 클러스터 2개")).toBeTruthy());

    await user.click(screen.getByRole("tab", { name: "관리" }));
    expect(screen.getAllByText("준비 중")).toHaveLength(6);
    expect(screen.getByText("호스트 설정")).toBeTruthy();
    expect(screen.getByText("실시간 통합")).toBeTruthy();
  });

  it("renders server-owned access decisions and never fabricates Kubernetes rules", async () => {
    renderSettings("/settings?clusters=cluster-1#profile");

    expect(await screen.findByText("현재 권한 주체")).toBeTruthy();
    expect(screen.getByText("cluster-1")).toBeTruthy();
    expect(screen.getByText("cluster.read")).toBeTruthy();
    expect(screen.getByText("pod.exec")).toBeTruthy();
    expect(screen.getByRole("combobox", { name: "네임스페이스 범위" }).textContent)
      .toContain("shop");
    expect(screen.getByText("Kubernetes 사용자 규칙")).toBeTruthy();
    expect(screen.getByText("The signed-in product identity is not delegated to Kubernetes."))
      .toBeTruthy();
    expect(screen.getByText("The missing-resource cause is not observed.")).toBeTruthy();
    expect(settingsPort.getAccessProfile).toHaveBeenCalledWith("cluster-1", expect.any(AbortSignal));
    expect(shellStatePort.getNamespaceScope).toHaveBeenCalledWith(
      "cluster-1",
      expect.any(AbortSignal),
    );
  });

  it("reuses global theme and locale controllers for automatically persisted preferences", async () => {
    const user = userEvent.setup();
    renderSettings("/settings#preferences");

    await user.click(screen.getByRole("button", { name: "English" }));
    expect(screen.getByRole("heading", { name: "Settings", level: 2 })).toBeTruthy();
    expect(screen.getByText("Changes are saved automatically with optimistic revision checks."))
      .toBeTruthy();
  });
});

const settingsPort: SettingsPort = {
  getAccessProfile: vi.fn().mockResolvedValue({
    workspaceId: "default",
    userId: "user-bf4f9d6a-acf5-5612-bcd9-00d938e4a063",
    clusterId: "cluster-1",
    roles: ["service_admin"],
    authority: "opsia_rbac",
    permissions: [
      { permission: "cluster.read", category: "cluster", allowed: true },
      { permission: "pod.exec", category: "pod", allowed: false },
    ],
    kubernetesRules: {
      status: "unavailable",
      reasonCode: "subject_identity_not_delegated",
      detail: "The signed-in product identity is not delegated to Kubernetes.",
    },
    restrictedResourceTypes: {
      status: "unavailable",
      reasonCode: "visibility_cause_not_observed",
      detail: "The missing-resource cause is not observed.",
    },
    revision: "a".repeat(64),
  }),
};

const shellStatePort: ShellStatePort = {
  getNamespaceScope: vi.fn().mockResolvedValue({
    clusterId: "cluster-1",
    activeNamespaces: [],
    accessibleNamespaces: ["shop", "team-a"],
    accessibleNamespaceCount: 2,
    completeness: "exact",
    reasonCodes: [],
    revision: 0,
  }),
  updateNamespaceScope: vi.fn(),
  getUiPreferences: vi.fn(),
  updateUiPreferences: vi.fn(),
};

function renderSettings(initialEntry: string) {
  render(
    <I18nProvider navigatorLanguage="ko-KR" storage={null}>
      <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
        <MemoryRouter initialEntries={[initialEntry]}>
          <AuthSessionGateProvider reportUnauthorized={() => undefined}>
            <UnifiedFilterProvider>
              <ProductSessionProvider session={{
                displayName: "Woo Nyong",
                email: "woonyong.kr@gmail.com",
                roles: ["service_admin"],
                userId: "user-bf4f9d6a-acf5-5612-bcd9-00d938e4a063",
                workspaceId: "default",
              }}>
                <ClusterScopeProvider authorityKey="default:user" port={clusterScopePort}>
                  <SettingsPage settingsPort={settingsPort} shellStatePort={shellStatePort} />
                </ClusterScopeProvider>
              </ProductSessionProvider>
            </UnifiedFilterProvider>
          </AuthSessionGateProvider>
        </MemoryRouter>
      </ThemeProvider>
    </I18nProvider>,
  );
}

const clusterScopePort: ClusterScopePort = {
  listClusterChoices: async () => ({
    completeness: "unknown",
    clusters: [cluster("cluster-1"), cluster("cluster-2")],
  }),
};

function cluster(id: string) {
  return {
    id,
    workspaceId: "default",
    name: id,
    environment: "production",
    provider: "eks" as const,
    connectionStage: null,
    registrationState: "active" as const,
    connectionState: "online" as const,
    lastObservedAt: "2026-07-14T00:00:00.000Z",
    nodeCount: 1,
    podCount: 1,
    incidentCount: 0,
  };
}

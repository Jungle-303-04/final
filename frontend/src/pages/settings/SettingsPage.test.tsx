// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { MemoryRouter } from "react-router-dom";

import { ProductSessionProvider } from "../../features/auth/ProductSessionContext";
import { AuthSessionGateProvider } from "../../features/auth/AuthSessionGate";
import { ClusterScopeProvider } from "../../features/cluster-scope/ClusterScopeProvider";
import type { ClusterScopePort } from "../../features/cluster-scope/clusterScopeContract";
import { UnifiedFilterProvider } from "../../features/filters/UnifiedFilterProvider";
import { I18nProvider } from "../../shared/i18n";
import { SettingsPage } from "./SettingsPage";

afterEach(cleanup);

describe("SettingsPage", () => {
  it("shows verified session and cluster data while marking absent APIs honestly", async () => {
    render(
      <I18nProvider navigatorLanguage="ko-KR" storage={null}>
        <MemoryRouter>
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
                  <SettingsPage />
                </ClusterScopeProvider>
              </ProductSessionProvider>
            </UnifiedFilterProvider>
          </AuthSessionGateProvider>
        </MemoryRouter>
      </I18nProvider>,
    );

    expect(screen.getByRole("heading", { name: "워크스페이스 설정", level: 2 })).toBeTruthy();
    expect(screen.getByText("default")).toBeTruthy();
    expect(screen.getByText("Woo Nyong")).toBeTruthy();
    expect(screen.getByText("woonyong.kr@gmail.com")).toBeTruthy();
    await waitFor(() => expect(screen.getByText("표시 가능한 클러스터 2개")).toBeTruthy());
    expect(screen.getAllByText("준비 중")).toHaveLength(4);
    expect(screen.getByText("즉시 실행")).toBeTruthy();
    expect(screen.getByText("승인 필요")).toBeTruthy();
  });
});

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

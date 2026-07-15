// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthSessionGateProvider } from "../../features/auth/AuthSessionGate";
import { ProductSessionProvider } from "../../features/auth/ProductSessionContext";
import { ClusterScopeProvider } from "../../features/cluster-scope/ClusterScopeProvider";
import type { ClusterScopePort } from "../../features/cluster-scope/clusterScopeContract";
import type { ClustersPort, ClusterDisconnectPort } from "../../features/clusters/clustersContract";
import { UnifiedFilterProvider } from "../../features/filters/UnifiedFilterProvider";
import { I18nProvider } from "../../shared/i18n";
import { ClustersPage } from "./ClustersPage";

afterEach(cleanup);

describe("ClustersPage", () => {
  it("keeps the localized add-cluster name when the narrow layout hides its text", async () => {
    renderClustersPage();

    const addCluster = await screen.findByRole("button", { name: "Add cluster" });
    expect(addCluster.getAttribute("aria-label")).toBe("Add cluster");
    expect(addCluster.querySelector("span")?.className).toContain("hidden");
    expect(addCluster.querySelector("span")?.className).toContain("sm:inline");
  });
});

function renderClustersPage() {
  render(
    <I18nProvider navigatorLanguage="en-US" storage={null}>
      <AuthSessionGateProvider reportUnauthorized={vi.fn()}>
        <ProductSessionProvider session={{
          userId: "service-admin",
          roles: ["service_admin"],
          workspaceId: "workspace-main",
        }}>
          <MemoryRouter>
            <UnifiedFilterProvider>
              <ClusterScopeProvider authorityKey="workspace-main:service-admin" port={clusterScopePort}>
                <ClustersPage port={clustersPort} />
              </ClusterScopeProvider>
            </UnifiedFilterProvider>
          </MemoryRouter>
        </ProductSessionProvider>
      </AuthSessionGateProvider>
    </I18nProvider>,
  );
}

const clusterScopePort: ClusterScopePort = {
  listClusterChoices: vi.fn(async () => ({ completeness: "unknown", clusters: [] })),
};

const clustersPort: ClustersPort & ClusterDisconnectPort = {
  connect: vi.fn(),
  confirmManualCleanup: vi.fn(),
  disconnect: vi.fn(),
  loadConnection: vi.fn(),
  loadDisconnect: vi.fn(),
  reissue: vi.fn(),
};

// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createMemoryRouter, RouterProvider } from "react-router-dom";

import { AuthSessionGateProvider } from "../../features/auth/AuthSessionGate";
import { ClusterScopeProvider } from "../../features/cluster-scope/ClusterScopeProvider";
import { UnifiedFilterProvider } from "../../features/filters/UnifiedFilterProvider";
import { I18nProvider } from "../../shared/i18n";
import {
  resourcesClusterPort,
  resourcesNodePodsPort,
  resourcesPhysicalTopologyPort,
  resourcesRelationTopologyPort,
} from "../resources/ResourcesPage.testSupport";
import { TopologyPage } from "./TopologyPage";

afterEach(() => cleanup());

describe("independent Topology page", () => {
  it("renders real graph ports without mounting the Resources catalog or list", async () => {
    const user = userEvent.setup();
    const router = createMemoryRouter([{
      path: "/topology",
      element: (
        <I18nProvider navigatorLanguage="en-US" storage={null}>
          <AuthSessionGateProvider reportUnauthorized={vi.fn()}>
            <UnifiedFilterProvider>
              <ClusterScopeProvider
                authorityKey="workspace-a:user-a"
                port={resourcesClusterPort()}
              >
                <TopologyPage
                  nodePodsPort={resourcesNodePodsPort()}
                  physicalTopologyPort={resourcesPhysicalTopologyPort()}
                  relationTopologyPort={resourcesRelationTopologyPort()}
                />
              </ClusterScopeProvider>
            </UnifiedFilterProvider>
          </AuthSessionGateProvider>
        </I18nProvider>
      ),
    }], {
      initialEntries: ["/topology?clusters=cluster-1"],
    });

    render(<RouterProvider router={router} />);

    expect(await screen.findByRole("article", { name: "Server worker-a" })).toBeTruthy();
    expect(document.querySelector('[data-product-surface="topology"]')).toBeTruthy();
    expect(document.querySelector('[data-slot="resources-catalog-rail"]')).toBeNull();
    expect(screen.queryByRole("table", { name: "Resource list" })).toBeNull();

    await user.click(screen.getByRole("button", { name: "Relations" }));
    await waitFor(() => {
      expect(document.querySelector('[data-slot="relation-topology-canvas"]')).toBeTruthy();
    });
    expect(router.state.location.pathname).toBe("/topology");

    await user.click(screen.getByRole("button", {
      name: "Pod checkout-api-0, CrashLoopBackOff",
    }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/resources"));
    expect(router.state.location.search).toContain("resourceKind=Pod");
    expect(router.state.location.search).toContain("resource=v1%2Fcluster-1%2Fpod%2Fshop%2Fcheckout-api-0");
  });
});

// @vitest-environment jsdom

import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { ResourceDetail } from "../../features/resources/resourcesContract";
import { cleanup } from "@testing-library/react";
import {
  renderResources,
  resourcesActionsPort,
  resourcesCapabilitiesPort,
  resourcesClusterPort,
  resourcesFilterPort,
  resourcesMetricHistoryPort,
  resourcesPhysicalTopologyPort,
  resourcesPort,
} from "./ResourcesPage.testSupport";
import { POD_DETAIL } from "./ResourcesPage.testFixtures";

const DETAIL: ResourceDetail = {
  ...POD_DETAIL,
  identity: {
    resourceType: "workload",
    kind: "Deployment",
    namespace: "shop",
    name: "checkout-api",
  },
  resource: {
    ...POD_DETAIL.resource,
    id: "deployment:cluster-1/shop/checkout-api",
    inventoryKey: "deployment:shop/checkout-api",
    resourceType: "workload",
    apiVersion: "apps/v1",
    kind: "Deployment",
    name: "checkout-api",
    facts: {
      type: "workload",
      desiredReplicas: 3,
      readyReplicas: 3,
      availableReplicas: 3,
      updatedReplicas: 3,
      unavailableReplicas: 0,
      generation: 7,
      observedGeneration: 7,
    },
  },
};

afterEach(() => cleanup());

describe("resource detail capabilities", () => {
  it("renders only an authorized action and submits it through the real action port", async () => {
    const user = userEvent.setup();
    const actions = resourcesActionsPort();
    const capabilities = resourcesCapabilitiesPort({
      loadResourceCapabilities: vi.fn().mockResolvedValue({
        subject: {
          resourceId: DETAIL.resource.inventoryKey,
          snapshotId: "snapshot-42",
          clusterId: DETAIL.clusterId,
          resourceType: "workload",
          kind: "Deployment",
          namespace: "shop",
          name: "checkout-api",
        },
        revision: "a".repeat(64),
        capabilities: [{
          capabilityId: "deployment.restart",
          label: "Restart",
          description: "Restart this deployment and stream the operation result.",
          execution: "command",
          confirmationRequired: true,
          realtime: true,
          inputSchema: [],
          method: "POST",
          path: "/clusters/cluster-1/namespaces/shop/deployments/checkout-api/restart",
        }],
      }),
    });
    renderWithRuntime(capabilities, actions);

    const restart = await screen.findByRole(
      "button",
      { name: "Restart" },
      { timeout: 5_000 },
    );
    expect(screen.queryByRole("button", { name: "Scale" })).toBeNull();
    const actionBar = document.querySelector('[data-slot="resource-detail-actions"]');
    expect(actionBar).toBeTruthy();
    expect(within(actionBar as HTMLElement).queryAllByRole("button")
      .some((button) => button.hasAttribute("disabled")))
      .toBe(false);

    await user.click(restart);
    await user.click(screen.getByRole("button", { name: "확인" }));
    await waitFor(() => expect(actions.execute).toHaveBeenCalledWith(
      expect.objectContaining({ capabilityId: "deployment.restart" }),
      {},
    ));
    expect(await screen.findByText(/correlation correlation-1/u)).toBeTruthy();
  });

  it("does not render guessed controls while capability is absent or unavailable", async () => {
    const capabilities = resourcesCapabilitiesPort({
      loadResourceCapabilities: vi.fn().mockRejectedValue(new Error("offline")),
    });
    renderWithRuntime(capabilities, resourcesActionsPort());

    expect(await screen.findByRole(
      "dialog",
      { name: "checkout-api 상세" },
      { timeout: 5_000 },
    )).toBeTruthy();
    await waitFor(() => expect(capabilities.loadResourceCapabilities).toHaveBeenCalled());
    expect(screen.queryByRole("button", { name: "Restart" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Scale" })).toBeNull();
  });
});

function renderWithRuntime(
  capabilities: ReturnType<typeof resourcesCapabilitiesPort>,
  actions: ReturnType<typeof resourcesActionsPort>,
) {
  return renderResources(
    resourcesPort({ loadResourceDetail: vi.fn().mockResolvedValue(DETAIL) }),
    "/resources?clusters=cluster-1&resources.types=workload&detail=Deployment%2Fshop%2Fcheckout-api",
    resourcesClusterPort(),
    vi.fn(),
    "ko",
    resourcesFilterPort(),
    resourcesPhysicalTopologyPort(),
    resourcesMetricHistoryPort(),
    capabilities,
    actions,
  );
}

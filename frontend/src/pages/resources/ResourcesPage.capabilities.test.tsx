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
          requestContext: "simple",
          resultIntent: "refresh-resource",
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

  it("keeps management-cluster mutations visible but disabled by policy", async () => {
    const managementDetail: ResourceDetail = {
      ...DETAIL,
      clusterId: "kubernetes-ops",
      resource: {
        ...DETAIL.resource,
        clusterId: "kubernetes-ops",
        id: "deployment:kubernetes-ops/management/checkout-api",
        inventoryKey: "deployment:management/checkout-api",
        namespace: "management",
      },
      identity: {
        ...DETAIL.identity,
        namespace: "management",
      },
    };
    const capabilities = resourcesCapabilitiesPort({
      loadResourceCapabilities: vi.fn().mockResolvedValue({
        subject: {
          resourceId: managementDetail.resource.inventoryKey,
          snapshotId: "snapshot-management",
          clusterId: managementDetail.clusterId,
          resourceType: "workload",
          kind: "Deployment",
          namespace: "management",
          name: "checkout-api",
        },
        revision: "b".repeat(64),
        capabilities: [{
          capabilityId: "resource.delete",
          label: "Delete",
          description: "Delete this resource.",
          execution: "command",
          confirmationRequired: true,
          realtime: true,
          inputSchema: [],
          method: "POST",
          path: "/api/resource-actions/delete",
          requestContext: "exact-resource",
          resultIntent: "refresh-resource",
        }],
      }),
    });
    renderResources(
      resourcesPort({ loadResourceDetail: vi.fn().mockResolvedValue(managementDetail) }),
      "/resources?clusters=kubernetes-ops&resources.types=workload&detail=Deployment%2Fmanagement%2Fcheckout-api",
      resourcesClusterPort(),
      vi.fn(),
      "ko",
      resourcesFilterPort(),
      resourcesPhysicalTopologyPort(),
      resourcesMetricHistoryPort(),
      capabilities,
      resourcesActionsPort(),
    );

    expect(await screen.findByText("관리 클러스터 · 읽기 전용")).toBeTruthy();
    const deleteAction = await screen.findByRole("button", { name: "Delete" });
    expect(deleteAction.hasAttribute("disabled")).toBe(true);
    expect(deleteAction.getAttribute("title")).toBe(
      "관리 클러스터 보호 정책에 따라 상태 조회와 로그 확인만 허용됩니다. 변경 명령은 실행할 수 없습니다.",
    );
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

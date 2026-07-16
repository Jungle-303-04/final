// @vitest-environment jsdom

import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { ResourceDetail } from "../../features/resources/resourcesContract";
import {
  POD_DETAIL,
  renderResources,
  resourcesPort,
} from "./ResourcesPage.testSupport";

afterEach(cleanup);

describe("ResourcesPage related-resource navigation", () => {
  it("uses the exact related type and preserves full detail mode", async () => {
    const user = userEvent.setup();
    const relatedService = {
      ...POD_DETAIL.resource,
      id: "service:cluster-1/shop/checkout-api",
      inventoryKey: "service:shop/checkout-api",
      uid: "uid-service",
      resourceType: "service",
      apiVersion: "v1",
      kind: "Service",
      name: "checkout-api",
      facts: {
        type: "service" as const,
        serviceType: "ClusterIP",
        clusterIp: "10.96.0.10",
        externalUrl: null,
        externalHosts: [],
        selector: [],
        ports: [],
      },
    };
    const podDetail: ResourceDetail = {
      ...POD_DETAIL,
      related: [{ name: "Selected by", items: [relatedService] }],
    };
    const serviceDetail: ResourceDetail = {
      ...POD_DETAIL,
      identity: {
        resourceType: "service",
        kind: "Service",
        namespace: "shop",
        name: "checkout-api",
      },
      resource: relatedService,
      related: [],
    };
    const loadResourceDetail = vi.fn(async (
      _clusterId: string,
      identity: { kind: string },
    ) => identity.kind === "Service" ? serviceDetail : podDetail);
    const port = resourcesPort({ loadResourceDetail });
    renderResources(
      port,
      "/resources?clusters=cluster-1&resources.types=pod" +
      "&detail=Pod%2Fshop%2Fcheckout-api-0&full=1&tab=relations",
    );

    const podDialog = await screen.findByRole("dialog", { name: "checkout-api-0 상세" });
    await user.click(within(podDialog).getByRole("button", {
      name: "Service · shop/checkout-api",
    }));

    expect(await screen.findByRole("dialog", { name: "checkout-api 상세" })).toBeTruthy();
    await waitFor(() => expect(loadResourceDetail).toHaveBeenLastCalledWith(
      "cluster-1",
      {
        resourceType: "service",
        kind: "Service",
        namespace: "shop",
        name: "checkout-api",
      },
      expect.any(AbortSignal),
    ));
    expect(screen.getByTestId("resources-location").textContent)
      .toContain("resources.types=service&detail=Service%2Fshop%2Fcheckout-api&full=true");
    expect(document.querySelector('[data-detail-layout="full"]')).toBeTruthy();
  }, 15_000);
});

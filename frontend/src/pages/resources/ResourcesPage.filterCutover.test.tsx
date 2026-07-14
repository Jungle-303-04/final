// @vitest-environment jsdom

import { act, cleanup, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { UnifiedFilterState } from "../../features/filters/filterContract";
import {
  CLUSTERS,
  POD_LIST,
  deferred,
  resourcesClusterPort,
  resourcesFilterPort,
  resourcesPort,
} from "./ResourcesPage.testSupport";
import {
  lastFilterState,
  renderEnglishResources,
  resourcePage,
} from "./ResourcesPage.filterCutover.testSupport";

afterEach(cleanup);

describe("ResourcesPage unified-filter cutover", () => {
  it("forwards canonical URL state to the server filter contract", async () => {
    const port = resourcesPort();
    const listResourcePage = vi.fn().mockResolvedValue(resourcePage());
    const filterPort = resourcesFilterPort({ listResourcePage });
    renderEnglishResources(
      port,
      "/resources?clusters=cluster-1" +
      "&namespaces=cluster-1%2Fshop" +
      "&applications=checkout" +
      "&labels=team%3Dcheckout" +
      "&resources.types=pod" +
      "&resources.health=warning" +
      "&resources.q=checkout" +
      "&resources.includeDeleted=true" +
      "&resource=shop%2Fcheckout-api-0" +
      "&resourceKind=Pod" +
      "&full=true",
      resourcesClusterPort(),
      filterPort,
    );

    await waitFor(() => expect(listResourcePage).toHaveBeenCalled());
    const forwarded = lastFilterState(listResourcePage);
    expect(forwarded.common).toEqual({
      applications: ["checkout"],
      clusters: ["cluster-1"],
      labels: [{ key: "team", value: "checkout" }],
      namespaces: [{ clusterId: "cluster-1", namespace: "shop" }],
    });
    expect(forwarded.resources).toEqual({
      health: ["warning"],
      includeDeleted: true,
      query: "checkout",
      types: ["pod"],
      view: "table",
    });
    expect(port.listResources).not.toHaveBeenCalled();
    expect(screen.getByRole("button", {
      hidden: true,
      name: "Include inactive resources",
    }).getAttribute("aria-pressed")).toBe("true");

    const dialog = await screen.findByRole("dialog", {
      name: "checkout-api-0 details",
    });
    expect(dialog.className).toContain("max-w-none");
    expect(port.loadResourceDetail).toHaveBeenCalledWith(
      "cluster-1",
      {
        kind: "Pod",
        name: "checkout-api-0",
        namespace: "shop",
        resourceType: "pod",
      },
      expect.any(AbortSignal),
    );
  }, 15_000);

  it.each([
    ["no Cluster filter", "/resources?resources.types=pod"],
    [
      "multiple Cluster filters",
      "/resources?clusters=cluster-1,kubernetes-ops&resources.types=pod",
    ],
  ])("does not issue a list request for %s", async (_case, entry) => {
    const clusters = deferred<typeof CLUSTERS>();
    const port = resourcesPort();
    const filterPort = resourcesFilterPort();
    const clusterPort = resourcesClusterPort({
      listClusterChoices: vi.fn().mockReturnValue(clusters.promise),
    });
    renderEnglishResources(port, entry, clusterPort, filterPort);

    await act(async () => {
      clusters.resolve(CLUSTERS);
      await clusters.promise;
    });
    await waitFor(() => expect(screen.getByTestId("resources-cluster-scope").textContent)
      .toMatch(/^ready:/u));
    await act(async () => { await Promise.resolve(); });

    expect(filterPort.listResourcePage).not.toHaveBeenCalled();
    expect(port.listResources).not.toHaveBeenCalled();
    expect(port.loadCatalog).not.toHaveBeenCalled();
  });

  it.each([
    {
      assertState: (state: UnifiedFilterState) => {
        expect(state.common.applications).toEqual(["checkout"]);
      },
      name: "Application filter",
      suffix: "&applications=checkout",
    },
    {
      assertState: (state: UnifiedFilterState) => {
        expect(state.common.labels).toEqual([{ key: "team", value: "checkout" }]);
      },
      name: "label filter",
      suffix: "&labels=team%3Dcheckout",
    },
    {
      assertState: (state: UnifiedFilterState) => {
        expect(state.resources.health).toEqual(["warning"]);
      },
      name: "health filter",
      suffix: "&resources.health=warning",
    },
    {
      assertState: (state: UnifiedFilterState) => {
        expect(state.resources.query).toBe("checkout");
      },
      name: "server search",
      suffix: "&resources.q=checkout",
    },
    {
      assertState: (state: UnifiedFilterState) => {
        expect(state.common.namespaces).toEqual([
          { clusterId: "cluster-1", namespace: "ops" },
          { clusterId: "cluster-1", namespace: "shop" },
        ]);
      },
      name: "multiple Namespace filters",
      suffix: "&namespaces=cluster-1%2Fshop,cluster-1%2Fops",
    },
  ])("supports $name through the server contract and narrows the table", async ({
    assertState,
    suffix,
  }) => {
    const port = resourcesPort();
    const listResourcePage = vi.fn().mockResolvedValue(resourcePage([POD_LIST.items[0]]));
    const filterPort = resourcesFilterPort({ listResourcePage });
    renderEnglishResources(
      port,
      `/resources?clusters=cluster-1&resources.types=pod${suffix}`,
      resourcesClusterPort(),
      filterPort,
    );

    const checkout = await screen.findByRole(
      "button",
      { name: "Open details for checkout-api-0" },
      { timeout: 5_000 },
    );
    expect(checkout).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Open details for orders-api-0" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Open details for telemetry-0" })).toBeNull();
    assertState(lastFilterState(listResourcePage));
    expect(port.listResources).not.toHaveBeenCalled();
  }, 15_000);

  it("keeps explicit detail retrieval independent from the filtered list", async () => {
    const port = resourcesPort();
    const listResourcePage = vi.fn().mockResolvedValue(resourcePage([]));
    const filterPort = resourcesFilterPort({ listResourcePage });
    renderEnglishResources(
      port,
      "/resources?clusters=cluster-1&resources.types=pod" +
      "&labels=team%3Dcheckout" +
      "&resource=shop%2Fcheckout-api-0&resourceKind=Pod",
      resourcesClusterPort(),
      filterPort,
    );

    expect(await screen.findByRole("dialog", { name: "checkout-api-0 details" })).toBeTruthy();
    await waitFor(() => expect(listResourcePage).toHaveBeenCalled());
    expect(lastFilterState(listResourcePage).common.labels)
      .toEqual([{ key: "team", value: "checkout" }]);
    expect(port.listResources).not.toHaveBeenCalled();
    expect(port.loadResourceDetail).toHaveBeenCalledWith(
      "cluster-1",
      {
        kind: "Pod",
        name: "checkout-api-0",
        namespace: "shop",
        resourceType: "pod",
      },
      expect.any(AbortSignal),
    );
  }, 15_000);

});

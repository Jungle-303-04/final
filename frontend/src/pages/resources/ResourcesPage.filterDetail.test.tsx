// @vitest-environment jsdom

import { act, cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CATALOG,
  resourcesClusterPort,
  resourcesFilterPort,
  resourcesPort,
} from "./ResourcesPage.testSupport";
import {
  canonicalDetailEntry,
  expectDetailQueryPreserved,
  lastFilterState,
  readResourcesQuery,
  renderEnglishResources,
} from "./ResourcesPage.filterCutover.testSupport";
import { encodeResourceTarget } from "./resourcesUrlState";

afterEach(cleanup);

describe("ResourcesPage unified-filter detail identity", () => {
  it("writes the exact detail path and lets browser history close it", async () => {
    const port = resourcesPort();
    const view = renderEnglishResources(
      port,
      "/resources?clusters=cluster-1&resources.types=pod&view=list",
    );
    const row = await screen.findByRole("button", { name: "Open details for checkout-api-0" });
    fireEvent.click(row);
    expect(await screen.findByRole("dialog", { name: "checkout-api-0 details" })).toBeTruthy();
    expect(readResourcesQuery().get("detail")).toBe("Pod/shop/checkout-api-0");
    expect(readResourcesQuery().get("resource")).toBeNull();

    await act(async () => {
      await view.router.navigate(-1);
    });

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(readResourcesQuery().get("detail")).toBeNull();
    expect(port.loadResourceDetail).toHaveBeenCalledTimes(1);
  }, 15_000);

  it("loads a self-contained detail even when the partial catalog omits its type", async () => {
    const port = resourcesPort({
      loadCatalog: vi.fn().mockResolvedValue({
        ...CATALOG,
        items: CATALOG.items.filter((item) => item.resourceType !== "pod"),
      }),
    });
    const target = encodeResourceTarget("cluster-1", {
      kind: "Pod",
      name: "checkout-api-0",
      namespace: "shop",
      resourceType: "pod",
    });
    renderEnglishResources(
      port,
      "/resources?clusters=cluster-1&resources.types=node" +
      `&resource=${encodeURIComponent(target.resource)}&resourceKind=Pod`,
    );

    expect(await screen.findByRole("dialog", { name: "checkout-api-0 details" })).toBeTruthy();
    await waitFor(() => expect(port.loadResourceDetail).toHaveBeenCalledWith(
      "cluster-1",
      expect.objectContaining({ resourceType: "pod", name: "checkout-api-0" }),
      expect.any(AbortSignal),
    ));
  }, 15_000);

  it.each([
    { key: "resources.q", name: "search query", value: "payments" },
    { key: "namespaces", name: "Namespace filter", value: "cluster-1/ops" },
  ])("retains detail identity when the global $name changes", async ({ key, value }) => {
    const port = resourcesPort();
    const filterPort = resourcesFilterPort();
    const view = renderEnglishResources(
      port,
      canonicalDetailEntry(),
      resourcesClusterPort(),
      filterPort,
    );
    expect(await screen.findByRole("dialog", { name: "checkout-api-0 details" })).toBeTruthy();

    const current = new URL(
      screen.getByTestId("resources-location").textContent ?? "",
      "https://product.test",
    );
    current.searchParams.set(key, value);
    await act(async () => {
      await view.router.navigate(`${current.pathname}${current.search}`);
    });

    await waitFor(() => expect(readResourcesQuery().get(key)).toBe(value));
    expect(screen.getByRole("dialog", { name: "checkout-api-0 details" })).toBeTruthy();
    expectDetailQueryPreserved(readResourcesQuery());
    expect(port.loadResourceDetail).toHaveBeenCalledTimes(1);
    await waitFor(() => {
      const forwarded = lastFilterState(vi.mocked(filterPort.listResourcePage));
      if (key === "resources.q") expect(forwarded.resources.query).toBe(value);
      if (key === "namespaces") {
        expect(forwarded.common.namespaces).toEqual([
          { clusterId: "cluster-1", namespace: "ops" },
        ]);
      }
    });
  }, 15_000);

  it("keeps collection controls in the list column and out of the detail panel", async () => {
    renderEnglishResources(resourcesPort(), canonicalDetailEntry());
    const dialog = await screen.findByRole("dialog", { name: "checkout-api-0 details" });

    expect(await screen.findByRole(
      "button",
      { name: "Include inactive resources" },
    )).toBeTruthy();
    expect(within(dialog).queryByRole(
      "button",
      { name: "Include inactive resources" },
    )).toBeNull();
    expectDetailQueryPreserved(readResourcesQuery());
  }, 15_000);

  it("uses resources.types as authority when a legacy path disagrees", async () => {
    const port = resourcesPort();
    const filterPort = resourcesFilterPort();
    renderEnglishResources(
      port,
      "/resources/node?cluster=cluster-1&clusters=cluster-1&resources.types=pod&view=list",
      resourcesClusterPort(),
      filterPort,
    );

    await waitFor(() => expect(filterPort.listResourcePage).toHaveBeenCalled());
    expect(lastFilterState(vi.mocked(filterPort.listResourcePage)).resources.types)
      .toEqual(["pod"]);
    expect(screen.getByRole("heading", { name: "Pod" })).toBeTruthy();
  }, 15_000);
});

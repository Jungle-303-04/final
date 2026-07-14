// @vitest-environment jsdom

import { act, cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { UnifiedFilterState } from "../../features/filters/filterContract";
import type {
  ResourcesFilterPort,
  ResourcesFilterResourcePage,
} from "../../features/resources/resourcesFilterContract";
import {
  CLUSTERS,
  CATALOG,
  POD_LIST,
  deferred,
  renderResources,
  resourcesClusterPort,
  resourcesFilterPort,
  resourcesPort,
} from "./ResourcesPage.testSupport";
import { encodeResourceTarget } from "./resourcesUrlState";

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

  it("does not retarget an open detail when Cluster and resource-type filters change", async () => {
    const port = resourcesPort();
    const view = renderEnglishResources(
      port,
      "/resources?clusters=cluster-1&resources.types=pod",
    );
    const row = await screen.findByRole("button", { name: "Open details for checkout-api-0" });
    fireEvent.click(row);
    expect(await screen.findByRole("dialog", { name: "checkout-api-0 details" })).toBeTruthy();
    const target = readResourcesQuery().get("resource");
    expect(target).toMatch(/^v1\//u);

    await act(async () => {
      await view.router.navigate(
        "/resources?clusters=kubernetes-ops&resources.types=node" +
        `&resource=${encodeURIComponent(target ?? "")}&resourceKind=Pod`,
      );
    });

    await waitFor(() => expect(readResourcesQuery().get("clusters")).toBe("kubernetes-ops"));
    expect(port.loadResourceDetail).toHaveBeenCalledTimes(1);
    expect(port.loadResourceDetail).toHaveBeenLastCalledWith(
      "cluster-1",
      expect.objectContaining({ resourceType: "pod", name: "checkout-api-0" }),
      expect.any(AbortSignal),
    );
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
    await waitFor(() => expect(filterPort.listResourcePage).toHaveBeenCalled());
    const forwarded = lastFilterState(vi.mocked(filterPort.listResourcePage));
    if (key === "resources.q") expect(forwarded.resources.query).toBe(value);
    if (key === "namespaces") {
      expect(forwarded.common.namespaces).toEqual([
        { clusterId: "cluster-1", namespace: "ops" },
      ]);
    }
  }, 15_000);

  it("retains detail identity while changing the inactive-resource filter", async () => {
    renderEnglishResources(resourcesPort(), canonicalDetailEntry());
    expect(await screen.findByRole("dialog", { name: "checkout-api-0 details" })).toBeTruthy();

    fireEvent.click(await screen.findByRole(
      "button",
      { hidden: true, name: "Include inactive resources" },
    ));

    await waitFor(() => {
      expect(readResourcesQuery().get("resources.includeDeleted")).toBe("true");
    });
    expect(screen.getByRole("dialog", { name: "checkout-api-0 details" })).toBeTruthy();
    expectDetailQueryPreserved(readResourcesQuery());
  }, 15_000);

  it("uses resources.types as authority when a legacy path disagrees", async () => {
    const port = resourcesPort();
    const filterPort = resourcesFilterPort();
    renderEnglishResources(
      port,
      "/resources/node?cluster=cluster-1&clusters=cluster-1&resources.types=pod",
      resourcesClusterPort(),
      filterPort,
    );

    await waitFor(() => expect(filterPort.listResourcePage).toHaveBeenCalled());
    expect(lastFilterState(vi.mocked(filterPort.listResourcePage)).resources.types)
      .toEqual(["pod"]);
    expect(screen.getByRole("heading", { name: "pod" })).toBeTruthy();
  }, 15_000);
});

function renderEnglishResources(
  port: ReturnType<typeof resourcesPort>,
  entry: string,
  clusterPort = resourcesClusterPort(),
  filterPort: ResourcesFilterPort = resourcesFilterPort(),
) {
  return renderResources(port, entry, clusterPort, vi.fn(), "en", filterPort);
}

function resourcePage(
  resources: ResourcesFilterResourcePage["items"][number]["resource"][] = POD_LIST.items,
): ResourcesFilterResourcePage {
  return {
    items: resources.map((resource) => ({
      applicationBindingCompleteness: "exact",
      applicationIds: [],
      cluster: {
        clusterId: resource.clusterId,
        name: resource.clusterId,
        provider: "eks",
      },
      resource,
    })),
    nextCursor: null,
    hasMore: false,
    counts: {
      filteredCount: resources.length,
      unfilteredCount: POD_LIST.items.length,
      filteredCountCompleteness: "exact",
      unfilteredCountCompleteness: "exact",
    },
    snapshot: {
      snapshotRevision: 42,
      authorizationRevision: "auth-1",
      filterFingerprint: "filter-1",
      observedAt: "2026-07-12T10:00:00.000Z",
      stale: false,
      partialReasonCodes: [],
    },
    excludedCount: 0,
    dataQualityWarnings: [],
  };
}

function lastFilterState(
  request: ReturnType<typeof vi.fn>,
): UnifiedFilterState {
  const calls = request.mock.calls;
  const state = calls[calls.length - 1]?.[0] as UnifiedFilterState | undefined;
  if (!state) throw new Error("Expected a Resources filter request");
  return state;
}

function canonicalDetailEntry(): string {
  return "/resources/pod?cluster=cluster-1&clusters=cluster-1" +
    "&namespaces=cluster-1%2Fshop&namespace=shop" +
    "&resources.types=pod" +
    "&resource=shop%2Fcheckout-api-0&resourceKind=Pod&kind=Pod&full=true";
}

function readResourcesQuery(): URLSearchParams {
  const location = screen.getByTestId("resources-location").textContent ?? "";
  return new URL(location, "https://product.test").searchParams;
}

function expectDetailQueryPreserved(query: URLSearchParams) {
  expect(query.get("resource")).toMatch(/^v1\//u);
  expect(query.get("resourceKind")).toBe("Pod");
  expect(query.get("full")).toBe("true");
}

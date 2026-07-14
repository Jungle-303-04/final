// @vitest-environment jsdom

import { act, cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CLUSTERS,
  CATALOG,
  deferred,
  renderResources,
  resourcesClusterPort,
  resourcesPort,
} from "./ResourcesPage.testSupport";
import { encodeResourceTarget } from "./resourcesUrlState";

afterEach(cleanup);

describe("ResourcesPage unified-filter cutover", () => {
  it("hydrates the supported single-value projection from canonical URL state", async () => {
    const port = resourcesPort();
    renderEnglishResources(
      port,
      "/resources?clusters=cluster-1" +
      "&namespaces=cluster-1%2Fshop" +
      "&resources.types=pod" +
      "&resources.includeDeleted=true" +
      "&resource=shop%2Fcheckout-api-0" +
      "&resourceKind=Pod" +
      "&full=true",
    );

    await waitFor(() => expect(port.listResources).toHaveBeenCalledWith(
      "cluster-1",
      expect.objectContaining({
        includeDeleted: true,
        namespace: "shop",
        resourceType: "pod",
      }),
      expect.any(AbortSignal),
    ), { timeout: 1_000 });
    expect((screen.getByRole("searchbox", {
      hidden: true,
      name: "Search displayed results",
    }) as HTMLInputElement).value).toBe("");
    expect((screen.getByRole("textbox", {
      hidden: true,
      name: "Namespace filter",
    }) as HTMLInputElement).value)
      .toBe("shop");
    expect(screen.getByRole("button", {
      hidden: true,
      name: "Include inactive resources",
    })
      .getAttribute("aria-pressed")).toBe("true");

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
  ])("does not issue a single-cluster list request for %s", async (_case, entry) => {
    const clusters = deferred<typeof CLUSTERS>();
    const port = resourcesPort();
    const clusterPort = resourcesClusterPort({
      listClusterChoices: vi.fn().mockReturnValue(clusters.promise),
    });
    renderEnglishResources(port, entry, clusterPort);

    await act(async () => {
      clusters.resolve(CLUSTERS);
      await clusters.promise;
    });
    await waitFor(() => expect(screen.getByTestId("resources-cluster-scope").textContent)
      .toMatch(/^ready:/u));
    await act(async () => { await Promise.resolve(); });

    expect(port.listResources).not.toHaveBeenCalled();
    expect(port.loadCatalog).not.toHaveBeenCalled();
  });

  it.each([
    ["Application filter", "&applications=checkout"],
    ["label filter", "&labels=team%3Dcheckout"],
    ["health filter", "&resources.health=warning"],
    ["server search", "&resources.q=checkout"],
    [
      "multiple Namespace filters",
      "&namespaces=cluster-1%2Fshop,cluster-1%2Fops",
    ],
    [
      "a Namespace outside the selected Cluster",
      "&namespaces=kubernetes-ops%2Fkube-system",
    ],
  ])("fails the list projection closed for an unsupported %s", async (_case, suffix) => {
    const port = resourcesPort();
    renderEnglishResources(
      port,
      `/resources?clusters=cluster-1&resources.types=pod${suffix}`,
    );

    expect(await screen.findByRole("heading", {
      hidden: true,
      name: "This filter needs server support",
    })).toBeTruthy();
    expect(port.loadCatalog).toHaveBeenCalledWith("cluster-1", expect.any(AbortSignal));
    expect(port.listResources).not.toHaveBeenCalled();
  });

  it("keeps explicit detail retrieval independent from an unsupported list projection", async () => {
    const port = resourcesPort();
    renderEnglishResources(
      port,
      "/resources?clusters=cluster-1&resources.types=pod" +
      "&labels=team%3Dcheckout" +
      "&resource=shop%2Fcheckout-api-0&resourceKind=Pod",
    );

    expect(await screen.findByRole("heading", {
      hidden: true,
      name: "This filter needs server support",
    })).toBeTruthy();
    expect(await screen.findByRole("dialog", { name: "checkout-api-0 details" })).toBeTruthy();
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
    {
      change: async () => {
        const search = await screen.findByRole(
          "searchbox",
          { hidden: true, name: "Search displayed results" },
        );
        fireEvent.change(search, { target: { value: "payments" } });
      },
      expected: { key: "resources.q", value: "payments" },
      name: "search query",
    },
    {
      change: async () => {
        const namespace = await screen.findByRole(
          "textbox",
          { hidden: true, name: "Namespace filter" },
        );
        fireEvent.change(namespace, { target: { value: "ops" } });
        fireEvent.click(screen.getByRole("button", { hidden: true, name: "Apply" }));
      },
      expected: { key: "namespaces", value: "cluster-1/ops" },
      name: "Namespace filter",
    },
    {
      change: async () => {
        fireEvent.click(await screen.findByRole(
          "button",
          { hidden: true, name: "Include inactive resources" },
        ));
      },
      expected: { key: "resources.includeDeleted", value: "true" },
      name: "inactive-resource filter",
    },
  ])("retains detail identity while changing the $name", async ({ change, expected }) => {
    renderEnglishResources(resourcesPort(), canonicalDetailEntry());
    expect(await screen.findByRole("dialog", { name: "checkout-api-0 details" })).toBeTruthy();

    await change();

    await waitFor(() => {
      const query = readResourcesQuery();
      expect(query.get(expected.key)).toBe(expected.value);
    });
    expect(screen.getByRole("dialog", { name: "checkout-api-0 details" })).toBeTruthy();
    expectDetailQueryPreserved(readResourcesQuery());
  }, 15_000);

  it("uses resources.types as authority when a legacy path disagrees", async () => {
    const port = resourcesPort();
    renderEnglishResources(
      port,
      "/resources/node?cluster=cluster-1&clusters=cluster-1&resources.types=pod",
    );

    await waitFor(() => expect(port.listResources).toHaveBeenCalledWith(
      "cluster-1",
      expect.objectContaining({ resourceType: "pod" }),
      expect.any(AbortSignal),
    ), { timeout: 1_000 });
    expect(screen.getByRole("heading", { name: "pod" })).toBeTruthy();
  }, 15_000);
});

function renderEnglishResources(
  port: ReturnType<typeof resourcesPort>,
  entry: string,
  clusterPort = resourcesClusterPort(),
) {
  return renderResources(port, entry, clusterPort, vi.fn(), "en");
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

// @vitest-environment jsdom

import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import {
  INFRA_MAP,
  renderResources,
  resourcesClusterPort,
  resourcesPort,
} from "./ResourcesPage.testSupport";

afterEach(cleanup);

describe("ResourcesPage VP-012 four-layer surface", () => {
  it("shows filters, Infra Map slot, and verified table together", async () => {
    const port = resourcesPort();
    renderEnglishResources(
      port,
      "/resources?clusters=cluster-1&resources.types=pod",
    );

    expect(await screen.findByRole("table", { name: "Resource list" })).toBeTruthy();
    expect(screen.getByRole("region", { name: "Resource filters" })).toBeTruthy();
    expect(screen.getByRole("heading", { level: 2, name: "Infra Map" })).toBeTruthy();
    expect(screen.getByText("Cluster overview")).toBeTruthy();
    const infraMap = document.querySelector('[data-slot="resources-infra-map-shell"]');
    if (!(infraMap instanceof HTMLElement)) throw new Error("Infra Map shell not found");
    const nodeGrid = document.querySelector('[data-slot="infra-map-node-grid"]');
    if (!(nodeGrid instanceof HTMLElement)) throw new Error("Infra Map node grid not found");
    expect(nodeGrid.dataset.layout).toBe("pair");
    expect(await within(infraMap).findByText("Node: worker-a")).toBeTruthy();
    expect(within(infraMap).getByText("checkout-api-0")).toBeTruthy();
    expect(within(infraMap).getByText("orders-api-0")).toBeTruthy();
    expect(within(infraMap).getByText("52% 2,100m")).toBeTruthy();
    expect(within(infraMap).getAllByText("2% 2/110").length).toBeGreaterThan(0);

    expect(screen.getAllByRole("img", { name: "CPU trend unavailable" })).toHaveLength(3);
    expect(document.querySelector('[data-slot="resource-trend-sparkline"]')).toBeNull();
    expect(screen.queryByRole("button", { name: "Graph" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Table" })).toBeNull();
    expect(port.loadCatalog).toHaveBeenCalledWith("cluster-1", expect.any(AbortSignal));
    expect(port.listResources).toHaveBeenCalledWith(
      "cluster-1",
      expect.objectContaining({ resourceType: "pod" }),
      expect.any(AbortSignal),
    );
    expect(port.loadInfraMap).toHaveBeenCalledWith(
      "cluster-1",
      expect.objectContaining({ includeDeleted: false, limit: 200 }),
      expect.any(AbortSignal),
    );
  }, 15_000);

  it("centers the Infra Map node when a cluster has a single observed node", async () => {
    const port = resourcesPort({
      loadInfraMap: async (clusterId) => ({
        ...INFRA_MAP,
        clusterId,
        nodes: INFRA_MAP.nodes.slice(0, 1),
        pods: INFRA_MAP.pods.filter((pod) =>
          pod.facts.type === "pod" && pod.facts.nodeName === "worker-a"),
      }),
    });
    renderEnglishResources(
      port,
      "/resources?clusters=cluster-1&resources.types=pod",
    );

    expect(await screen.findByRole("table", { name: "Resource list" })).toBeTruthy();
    const infraMap = document.querySelector('[data-slot="resources-infra-map-shell"]');
    if (!(infraMap instanceof HTMLElement)) throw new Error("Infra Map shell not found");
    expect(await within(infraMap).findByText("Node: worker-a")).toBeTruthy();
    const nodeGrid = document.querySelector('[data-slot="infra-map-node-grid"]');
    if (!(nodeGrid instanceof HTMLElement)) throw new Error("Infra Map node grid not found");
    expect(nodeGrid.dataset.layout).toBe("single");
    expect(nodeGrid.className).toContain("max-w-xl");
    expect(within(infraMap).queryByText("Node: worker-b")).toBeNull();
  }, 15_000);

  it("switches the Infra Map Pod slot fill metric from the header tabs", async () => {
    const user = userEvent.setup();
    const port = resourcesPort();
    renderEnglishResources(
      port,
      "/resources?clusters=cluster-1&resources.types=pod",
    );

    expect(await screen.findByRole("table", { name: "Resource list" })).toBeTruthy();
    const infraMap = document.querySelector('[data-slot="resources-infra-map-shell"]');
    if (!(infraMap instanceof HTMLElement)) throw new Error("Infra Map shell not found");
    expect(await within(infraMap).findByText("Node: worker-a")).toBeTruthy();
    const firstPod = podSlotByName(infraMap, "checkout-api-0");
    expect(firstPod.dataset.metric).toBe("cpu");
    expect(firstPod.dataset.metricAvailable).toBe("true");
    const cpuFill = firstPod.querySelector('[data-slot="infra-map-pod-fill"]');
    if (!(cpuFill instanceof HTMLElement)) throw new Error("Infra Map Pod fill not found");
    expect(Number(cpuFill.getAttribute("value"))).toBeGreaterThan(0);

    await user.click(within(infraMap).getByRole("button", { name: "Memory" }));

    const updatedPod = podSlotByName(infraMap, "checkout-api-0");
    expect(updatedPod.dataset.metric).toBe("memory");
    expect(updatedPod.dataset.metricAvailable).toBe("true");
    const memoryFill = updatedPod.querySelector('[data-slot="infra-map-pod-fill"]');
    if (!(memoryFill instanceof HTMLElement)) throw new Error("Infra Map Pod fill not found");
    expect(Number(memoryFill.getAttribute("value"))).toBeGreaterThan(0);
  }, 15_000);

  it("canonicalizes the retired graph mode without hiding either Infra Map or table", async () => {
    const port = resourcesPort();
    renderEnglishResources(
      port,
      "/resources?clusters=cluster-1&resources.types=pod&resources.view=graph",
    );

    expect(await screen.findByRole("table", { name: "Resource list" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Infra Map" }))
      .toBeTruthy();
    await waitFor(() => expect(readResourcesQuery().has("resources.view")).toBe(false));
    expect(port.listResources).toHaveBeenCalledOnce();
    expect(port.loadInfraMap).toHaveBeenCalledOnce();
  }, 15_000);

  it("keeps multi-Cluster scope unavailable instead of issuing a single-Cluster request", async () => {
    const port = resourcesPort();
    renderEnglishResources(
      port,
      "/resources?clusters=cluster-1,kubernetes-ops&resources.types=pod",
    );

    expect(await screen.findByRole("heading", {
      name: "Multi-Cluster results need server support",
    })).toBeTruthy();
    expect(port.loadCatalog).not.toHaveBeenCalled();
    expect(port.listResources).not.toHaveBeenCalled();
    expect(screen.queryByRole("table", { name: "Resource list" })).toBeNull();
  });

  it("opens the real resource detail and isolates unsupported historical evidence", async () => {
    const user = userEvent.setup();
    const port = resourcesPort();
    renderEnglishResources(
      port,
      "/resources?clusters=cluster-1&resources.types=pod",
    );

    await user.click(await screen.findByRole("button", {
      name: "Open details for checkout-api-0",
    }));
    const dialog = await screen.findByRole("dialog", { name: "checkout-api-0 details" });
    const infraMap = document.querySelector('[data-slot="resources-infra-map-shell"]');
    if (!(infraMap instanceof HTMLElement)) throw new Error("Infra Map shell not found");
    await waitFor(() => expect(within(infraMap).getByText("Selection")).toBeTruthy());
    expect(within(infraMap).getByText("checkout-api-0")).toBeTruthy();
    expect(within(infraMap).queryByText("orders-api-0")).toBeNull();

    expect(await within(dialog).findByText("Point-in-time evidence")).toBeTruthy();
    expect(within(dialog).getByText("CPU and memory history")).toBeTruthy();
    expect(within(dialog).getByText("Logs at the selected time")).toBeTruthy();
    expect(within(dialog).getByText("Related incident")).toBeTruthy();
    expect(within(dialog).getAllByText("Unavailable")).toHaveLength(3);
    expect(within(dialog).getAllByText("Running").length).toBeGreaterThan(0);
    expect(port.loadResourceDetail).toHaveBeenCalledWith(
      "cluster-1",
      expect.objectContaining({ name: "checkout-api-0" }),
      expect.any(AbortSignal),
    );
  }, 15_000);
});

function renderEnglishResources(port: ReturnType<typeof resourcesPort>, entry: string) {
  return renderResources(port, entry, resourcesClusterPort(), undefined, "en");
}

function readResourcesQuery(): URLSearchParams {
  const location = screen.getByTestId("resources-location").textContent ?? "";
  return new URL(location, "https://product.test").searchParams;
}

function podSlotByName(container: HTMLElement, name: string): HTMLElement {
  const heading = within(container).getByText(name);
  const pod = heading.closest('[data-slot="infra-map-pod"]');
  if (!(pod instanceof HTMLElement)) throw new Error(`${name} Pod slot not found`);
  return pod;
}

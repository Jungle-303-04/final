// @vitest-environment jsdom

import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  deferred,
  PHYSICAL_TOPOLOGY,
  renderResources,
  resourcesClusterPort,
  resourcesFilterPort,
  resourcesPhysicalTopologyPort,
  resourcesPort,
} from "./ResourcesPage.testSupport";

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

describe("ResourcesPage S4 physical topology", () => {
  it("renders verified servers and pods without re-filtering the response", async () => {
    const physicalPort = resourcesPhysicalTopologyPort();
    renderEnglishResources(
      "/resources?clusters=cluster-1&resources.types=pod",
      physicalPort,
    );

    expect(await screen.findByRole("table", { name: "Resource list" })).toBeTruthy();
    expect(screen.getByRole("region", { name: "Resource filters" })).toBeTruthy();
    expect(screen.getByText("Physical placement")).toBeTruthy();
    expect(screen.getByRole("group", { name: "Server placement view" })).toBeTruthy();
    expect(document.body.textContent).not.toContain("Topology");
    expect(await screen.findByRole("article", { name: "Server worker-a" })).toBeTruthy();
    expect(screen.getByRole("article", { name: "Server worker-b" })).toBeTruthy();
    const physicalGrid = document.querySelector('[data-slot="physical-topology-grid"]');
    expect(physicalGrid?.className)
      .toContain("grid-cols-[repeat(auto-fit,minmax(min(100%,320px),1fr))]");
    expect(document.querySelector(".react-flow")).toBeNull();
    expect(screen.getByRole("article", { name: "Server worker-a" }).className)
      .toContain("w-full");
    expect(screen.getByText("2 / 18 pods")).toBeTruthy();

    const crashLoop = screen.getByRole("button", {
      name: "Pod checkout-api-0, CrashLoopBackOff, usage 12%",
    });
    const highLoadNonMatch = screen.getByRole("button", {
      name: "Pod orders-api-0, Running, usage 91%",
    });
    expect(crashLoop.getAttribute("data-usage-tone")).toBe("neutral");
    expect(within(crashLoop).getByRole("img", { name: "CrashLoop" })).toBeTruthy();
    expect(highLoadNonMatch.getAttribute("data-usage-tone")).toBe("red");
    expect(highLoadNonMatch.getAttribute("data-matches-filter")).toBe("false");
    expect(highLoadNonMatch.getAttribute("disabled")).not.toBeNull();
    expect(document.querySelectorAll('[data-slot="physical-topology-pod"]')).toHaveLength(3);
    expect(document.querySelectorAll('[data-pod-badge="crash-loop"]')).toHaveLength(1);
    expect(document.querySelectorAll('[data-pod-badge="pending"]')).toHaveLength(1);
    expect(document.querySelectorAll('[data-pod-badge="restarting"]')).toHaveLength(0);

    const timeline = document.querySelector('[data-slot="resources-time-scrubber"]');
    expect(timeline?.getAttribute("data-state")).toBe("live");
    expect(timeline?.getAttribute("data-expanded")).toBe("false");
    expect(screen.queryByRole("slider", { name: "Time" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Play resource history" })).toBeNull();
    expect(physicalPort.loadPhysicalTopology).toHaveBeenCalledWith(
      expect.objectContaining({
        common: expect.objectContaining({ clusters: ["cluster-1"] }),
        resources: expect.objectContaining({ types: ["pod"] }),
      }),
      {},
      expect.any(AbortSignal),
    );
  }, 15_000);

  it("lands the server skeleton before topology data arrives", async () => {
    const pending = deferred<typeof PHYSICAL_TOPOLOGY>();
    const physicalPort = resourcesPhysicalTopologyPort({
      loadPhysicalTopology: vi.fn(() => pending.promise),
    });
    renderEnglishResources(
      "/resources?clusters=cluster-1&resources.types=pod",
      physicalPort,
    );

    expect(await screen.findByRole("status", {
      name: "Loading the server placement skeleton",
    })).toBeTruthy();
    expect(document.querySelectorAll('[data-slot="physical-server-skeleton"]'))
      .toHaveLength(2);
    expect(document.querySelector('[data-slot="resources-graph-shell"]')
      ?.getAttribute("data-phase")).toBe("loading");
    pending.resolve(PHYSICAL_TOPOLOGY);
    expect(await screen.findByRole("article", { name: "Server worker-a" })).toBeTruthy();
    expect(document.querySelector('[data-slot="resources-graph-shell"]')
      ?.getAttribute("data-phase")).toBe("ready");
  });

  it("uses content height for servers and keeps collapse in graph=0", async () => {
    const user = userEvent.setup();
    renderEnglishResources(
      "/resources?clusters=cluster-1&resources.types=pod",
      resourcesPhysicalTopologyPort(),
    );

    await screen.findByRole("article", { name: "Server worker-a" });
    const graph = document.querySelector('[data-slot="resources-graph-shell"]');
    expect(graph?.getAttribute("data-height")).toBeNull();
    expect(graph?.className).toContain("h-auto");
    expect(graph?.className).not.toContain("h-(--product-graph-height-mobile)");
    expect(document.querySelector('[data-slot="topology-canvas"]')?.className)
      .toContain("shrink-0");
    expect(document.querySelector('[data-slot="resources-graph-resize-handle"]')).toBeNull();

    await user.click(screen.getByRole("button", { name: "Collapse graph" }));
    await waitFor(() => expect(readResourcesQuery().get("graph")).toBe("0"));
    expect(graph?.getAttribute("data-collapsed")).toBe("true");
    expect(document.querySelector('[data-slot="topology-canvas"]')).toBeNull();

    await user.click(screen.getByRole("button", { name: "Expand graph" }));
    await waitFor(() => expect(readResourcesQuery().has("graph")).toBe(false));
    expect(graph?.getAttribute("data-collapsed")).toBe("false");
  });

  it("aborts the old topology request and ignores its late response", async () => {
    const first = deferred<typeof PHYSICAL_TOPOLOGY>();
    const freshTopology = {
      ...PHYSICAL_TOPOLOGY,
      servers: [{
        ...PHYSICAL_TOPOLOGY.servers[0],
        id: "node:fresh",
        name: "fresh-worker",
        matchedPodCount: 0,
        totalPodCount: 0,
      }],
      pods: [],
      truncatedByServer: {},
    };
    const loadPhysicalTopology = vi.fn()
      .mockImplementationOnce(() => first.promise)
      .mockResolvedValueOnce(freshTopology);
    const physicalPort = resourcesPhysicalTopologyPort({ loadPhysicalTopology });
    const rendered = renderEnglishResources(
      "/resources?clusters=cluster-1&resources.types=pod",
      physicalPort,
    );
    await waitFor(() => expect(loadPhysicalTopology).toHaveBeenCalledTimes(1));
    const firstSignal = loadPhysicalTopology.mock.calls[0]?.[2] as AbortSignal;

    await rendered.router.navigate(
      "/resources?clusters=cluster-1&resources.types=pod&resources.q=fresh",
    );
    await waitFor(() => expect(loadPhysicalTopology).toHaveBeenCalledTimes(2));
    expect(firstSignal.aborted).toBe(true);
    expect(await screen.findByRole("article", { name: "Server fresh-worker" })).toBeTruthy();

    first.resolve(PHYSICAL_TOPOLOGY);
    await Promise.resolve();
    expect(screen.queryByRole("article", { name: "Server worker-a" })).toBeNull();
  });

  it("loads physical placement for a Cluster-only zoom before a resource type is chosen", async () => {
    const physicalPort = resourcesPhysicalTopologyPort();
    renderEnglishResources("/resources?clusters=cluster-1", physicalPort);

    expect(await screen.findByRole("article", { name: "Server worker-a" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "All resources" })).toBeTruthy();
    expect(physicalPort.loadPhysicalTopology).toHaveBeenCalledOnce();
  });

  it("zooms from the unfiltered cluster grid into servers and rewinds to All", async () => {
    const user = userEvent.setup();
    const physicalPort = resourcesPhysicalTopologyPort();
    renderEnglishResources("/resources?resources.types=pod", physicalPort);

    expect(await screen.findByRole("region", { name: "Cluster zoom overview" }))
      .toBeTruthy();
    expect(document.querySelectorAll('[data-slot="cluster-server-preview"]'))
      .toHaveLength(2);
    expect(physicalPort.loadPhysicalTopology).not.toHaveBeenCalled();

    await user.click(screen.getByRole("link", { name: "Open resources for cluster-1" }));
    expect(await screen.findByRole("article", { name: "Server worker-a" })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "All" }));
    expect(await screen.findByRole("region", { name: "Cluster zoom overview" }))
      .toBeTruthy();
    expect(readResourcesQuery().has("clusters")).toBe(false);
  });

  it("opens the real node pod summary for an omitted-pod drill-in", async () => {
    const user = userEvent.setup();
    renderEnglishResources(
      "/resources?clusters=cluster-1&resources.types=pod",
      resourcesPhysicalTopologyPort(),
    );

    await user.click(await screen.findByRole("button", {
      name: "View every pod on server worker-a",
    }));
    const overlay = await screen.findByRole("dialog", { name: "Pods on server worker-a" });
    expect(within(overlay).getByText("checkout-api-0")).toBeTruthy();
    expect(within(overlay).getByText("Names for 17 additional pods are unavailable"))
      .toBeTruthy();
    expect(readResourcesQuery().has("node")).toBe(false);
  });

  it("keeps multi-Cluster scope honest and skips the physical request", async () => {
    const physicalPort = resourcesPhysicalTopologyPort();
    renderEnglishResources(
      "/resources?clusters=cluster-1,kubernetes-ops&resources.types=pod",
      physicalPort,
    );

    expect(await screen.findByRole("heading", {
      name: "Select one cluster",
    })).toBeTruthy();
    expect(physicalPort.loadPhysicalTopology).not.toHaveBeenCalled();
    expect(screen.queryByRole("table", { name: "Resource list" })).toBeNull();
  });

  it("opens the real resource detail from a matching physical pod", async () => {
    const user = userEvent.setup();
    renderEnglishResources(
      "/resources?clusters=cluster-1&resources.types=pod",
      resourcesPhysicalTopologyPort(),
    );

    await user.click(await screen.findByRole("button", {
      name: "Pod checkout-api-0, CrashLoopBackOff, usage 12%",
    }));
    const dialog = await screen.findByRole("dialog", { name: "checkout-api-0 details" });
    expect(await within(dialog).findByText("Point-in-time evidence")).toBeTruthy();
    expect(within(dialog).getAllByText("Unavailable")).toHaveLength(2);
  }, 15_000);
});

function renderEnglishResources(
  entry: string,
  physicalPort: ReturnType<typeof resourcesPhysicalTopologyPort>,
) {
  return renderResources(
    resourcesPort(),
    entry,
    resourcesClusterPort(),
    undefined,
    "en",
    resourcesFilterPort(),
    physicalPort,
  );
}

function readResourcesQuery(): URLSearchParams {
  const location = screen.getByTestId("resources-location").textContent ?? "";
  return new URL(location, "https://product.test").searchParams;
}

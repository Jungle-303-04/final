// @vitest-environment jsdom

import { act, cleanup, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { EMPTY_LOG_STREAM_PORT } from "../../features/log-stream/logStreamContract";
import type { RelationTopologySnapshot } from "../../features/resources/relationTopologyContract";
import {
  deferred,
  PHYSICAL_TOPOLOGY,
  renderResources,
  resourcesActionsPort,
  resourcesCapabilitiesPort,
  resourcesClusterPort,
  resourcesFilterPort,
  resourcesMetricHistoryPort,
  resourcesPhysicalTopologyPort,
  resourcesPort,
  resourcesRelationTopologyPort,
} from "./ResourcesPage.testSupport";

const nativeAnimate = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "animate");

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  if (nativeAnimate) {
    Object.defineProperty(HTMLElement.prototype, "animate", nativeAnimate);
  } else {
    delete (HTMLElement.prototype as Partial<HTMLElement>).animate;
  }
});

describe("ResourcesPage S9 relationship topology", () => {
  it("derives relations from an Application filter without persisting an automatic pin", async () => {
    const user = userEvent.setup();
    const relationPort = resourcesRelationTopologyPort();
    renderEnglishResources(
      "/resources?clusters=cluster-1&applications=checkout",
      relationPort,
    );

    expect(await screen.findByText(
      "Resource relationships",
      {},
      { timeout: 10_000 },
    )).toBeTruthy();
    expect(document.querySelector('[data-slot="resources-graph-shell"]')
      ?.getAttribute("data-view")).toBe("relations");
    expect(readResourcesQuery().has("view")).toBe(false);
    expect(relationPort.loadRelationTopology).toHaveBeenCalledWith(
      expect.objectContaining({
        common: expect.objectContaining({ applications: ["checkout"] }),
      }),
      {},
      expect.any(AbortSignal),
    );
    expect(screen.getByRole("button", { name: "Deployment ✓" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Pod ✓" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Service ✓" })).toBeTruthy();
    expect(screen.getByText(
      "The current filters work better as a relationship graph.",
    )).toBeTruthy();
    await waitFor(() => expect(vi.mocked(window.setTimeout)).toHaveBeenCalledWith(
      expect.any(Function),
      6_000,
    ));
    await user.click(screen.getByRole("button", { name: "Relations" }));
    expect(readResourcesQuery().get("view")).toBe("relations");
    expect(screen.queryByText(
      "The current filters work better as a relationship graph.",
    )).toBeNull();
  });

  it("pins a manual view in the URL and preserves the same Pod morph identity", async () => {
    const user = userEvent.setup();
    renderEnglishResources(
      "/resources?clusters=cluster-1&resources.types=pod",
      resourcesRelationTopologyPort(),
    );

    expect(await screen.findByRole("article", { name: "Server worker-a" })).toBeTruthy();
    expect(document.querySelector('[data-morph-id="pod:pod:shop/checkout-api-0"]'))
      .toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Relations" }));
    expect(await screen.findByText("Resource relationships")).toBeTruthy();
    expect(readResourcesQuery().get("view")).toBe("relations");
    expect(document.querySelector('[data-morph-id="pod:pod:shop/checkout-api-0"]'))
      .toBeTruthy();
    expect(screen.queryByText(
      "The current filters work better as a relationship graph.",
    )).toBeNull();
  });

  it("opens detail only through the exact inventory identity shared with the table", async () => {
    const user = userEvent.setup();
    renderEnglishResources(
      "/resources?clusters=cluster-1&resources.types=pod&view=relations",
      resourcesRelationTopologyPort(),
    );

    const podNode = await screen.findByRole("button", {
      name: "Pod checkout-api-0, CrashLoopBackOff",
    });
    await user.click(podNode);

    await waitFor(() => expect(screen.getByTestId("resources-location").textContent)
      .toContain("detail=Pod%2Fshop%2Fcheckout-api-0"));
    expect(podNode.getAttribute("data-selected")).toBe("true");
  });

  it("keeps the old ready scene until a filter-derived target can run the Pod FLIP", async () => {
    const physicalPending = deferred<typeof PHYSICAL_TOPOLOGY>();
    const relationPending = deferred<RelationTopologySnapshot>();
    const relationTopology = relationSnapshot();
    const physicalPort = resourcesPhysicalTopologyPort({
      loadPhysicalTopology: vi.fn()
        .mockResolvedValueOnce(PHYSICAL_TOPOLOGY)
        .mockImplementationOnce(() => physicalPending.promise),
    });
    const relationPort = resourcesRelationTopologyPort({
      loadRelationTopology: vi.fn()
        .mockResolvedValueOnce(relationTopology)
        .mockImplementationOnce(() => relationPending.promise),
    });
    const bounds = vi.spyOn(Element.prototype, "getBoundingClientRect")
      .mockReturnValue(domRect());
    const animate = vi.fn(() => ({ cancel: vi.fn() } as unknown as Animation));
    Object.defineProperty(HTMLElement.prototype, "animate", {
      configurable: true,
      value: animate,
    });
    const rendered = renderEnglishResources(
      "/resources?clusters=cluster-1&resources.types=pod",
      relationPort,
      physicalPort,
    );

    expect(await screen.findByRole("article", { name: "Server worker-a" })).toBeTruthy();
    expect(relationPort.loadRelationTopology).not.toHaveBeenCalled();
    await act(async () => {
      await rendered.router.navigate(
        "/resources?clusters=cluster-1&applications=checkout",
      );
    });
    await waitFor(() => expect(relationPort.loadRelationTopology).toHaveBeenCalledOnce());
    expect(physicalPort.loadPhysicalTopology).toHaveBeenCalledTimes(2);
    expect(document.querySelector('[data-morph-id="pod:pod:shop/checkout-api-0"]'))
      .toBeTruthy();

    await act(async () => {
      relationPending.resolve(relationTopology);
      await relationPending.promise;
    });
    expect(await screen.findByText("Resource relationships")).toBeTruthy();
    await waitFor(() => expect(animate).toHaveBeenCalled());
    expect(bounds).toHaveBeenCalled();
  });

  it("lets an explicit physical pin override automatic relation derivation", async () => {
    renderEnglishResources(
      "/resources?clusters=cluster-1&applications=checkout&view=physical",
      resourcesRelationTopologyPort(),
    );

    expect(await screen.findByText("Physical placement")).toBeTruthy();
    expect(readResourcesQuery().get("view")).toBe("physical");
    expect(screen.getByRole("button", { name: "Physical" })
      .getAttribute("aria-pressed")).toBe("true");
  });

  it("clears a topology pin when every topology filter is cleared", async () => {
    const user = userEvent.setup();
    renderEnglishResources(
      "/resources?clusters=cluster-1&view=relations",
      resourcesRelationTopologyPort(),
    );

    expect(await screen.findByText("Resource relationships")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "All" }));
    await waitFor(() => expect(readResourcesQuery().has("clusters")).toBe(false));
    await waitFor(() => expect(readResourcesQuery().has("view")).toBe(false));
  });
});

function renderEnglishResources(
  entry: string,
  relationTopologyPort: ReturnType<typeof resourcesRelationTopologyPort>,
  physicalTopologyPort = resourcesPhysicalTopologyPort(),
) {
  const timeout = vi.spyOn(window, "setTimeout");
  const rendered = renderResources(
    resourcesPort(),
    entry,
    resourcesClusterPort(),
    vi.fn(),
    "en",
    resourcesFilterPort(),
    physicalTopologyPort,
    resourcesMetricHistoryPort(),
    resourcesCapabilitiesPort(),
    resourcesActionsPort(),
    EMPTY_LOG_STREAM_PORT,
    relationTopologyPort,
  );
  return { ...rendered, timeout };
}

function relationSnapshot(): RelationTopologySnapshot {
  return {
    nodes: [
      { id: "deployment:shop/checkout-api", kind: "Deployment", name: "checkout-api", status: "Ready" },
      { id: "pod:shop/checkout-api-0", kind: "Pod", name: "checkout-api-0", status: "CrashLoopBackOff" },
    ],
    edges: [
      { from: "deployment:shop/checkout-api", to: "pod:shop/checkout-api-0", type: "owns" },
    ],
  };
}

function domRect(): DOMRect {
  return {
    bottom: 24,
    height: 24,
    left: 0,
    right: 24,
    top: 0,
    width: 24,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  };
}

function readResourcesQuery(): URLSearchParams {
  const location = screen.getByTestId("resources-location").textContent ?? "";
  return new URL(location, "https://product.test").searchParams;
}

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
      "/resources?clusters=cluster-1&applications=checkout&view=map",
      relationPort,
    );

    expect(await screen.findByText(
      "Resource relationships",
      {},
      { timeout: 10_000 },
    )).toBeTruthy();
    expect(document.querySelector('[data-slot="resources-graph-shell"]')
      ?.getAttribute("data-view")).toBe("relations");
    expect(readResourcesQuery().get("view")).toBe("map");
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
    expect(document.querySelector('[data-slot="topology-overlay-bar"]')).toBeTruthy();
    expect(document.querySelector('[data-slot="resources-graph-auto-hint"]')?.className)
      .toContain("motion-topology-overlay");
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
      "/resources?clusters=cluster-1&resources.types=pod&view=map",
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

  it("marks the graph busy instead of presenting a retained scene under a new filter", async () => {
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
    const rendered = renderEnglishResources(
      "/resources?clusters=cluster-1&resources.types=pod&view=map",
      relationPort,
      physicalPort,
    );

    expect(await screen.findByRole("article", { name: "Server worker-a" })).toBeTruthy();
    await waitFor(() => expect(relationPort.loadRelationTopology).toHaveBeenCalledOnce());
    expect(relationPort.loadRelationTopology).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        resources: expect.objectContaining({
          types: expect.arrayContaining(["service", "configmap", "secret", "application"]),
        }),
      }),
      {},
      expect.any(AbortSignal),
    );
    await act(async () => {
      await rendered.router.navigate(
        "/resources?clusters=cluster-1&applications=checkout&view=map",
      );
    });
    await waitFor(() => expect(relationPort.loadRelationTopology).toHaveBeenCalledTimes(2));
    expect(physicalPort.loadPhysicalTopology).toHaveBeenCalledTimes(2);
    expect(document.querySelector('[data-morph-id="pod:pod:shop/checkout-api-0"]')).toBeNull();
    expect(document.querySelector('[data-slot="resources-graph-shell"]')
      ?.getAttribute("aria-busy")).toBe("true");

    await act(async () => {
      relationPending.resolve(relationTopology);
      await relationPending.promise;
    });
    expect(await screen.findByText("Resource relationships")).toBeTruthy();
    expect(document.querySelector('[data-slot="resources-graph-shell"]')
      ?.getAttribute("aria-busy")).toBe("false");
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

  it("labels partial and unavailable relationship evidence without inventing graph records", async () => {
    const partialPort = resourcesRelationTopologyPort({
      loadRelationTopology: vi.fn().mockResolvedValue({
        ...relationSnapshot(),
        relationCompleteness: "partial",
        partialReasonCodes: ["source_labels_incomplete"],
      }),
    });
    const partial = renderEnglishResources(
      "/resources?clusters=cluster-1&applications=checkout&view=map",
      partialPort,
    );

    expect(await screen.findByText("Partial relationship evidence")).toBeTruthy();
    expect(screen.getByText("1 evidence limits")).toBeTruthy();
    partial.unmount();

    const unavailablePort = resourcesRelationTopologyPort({
      loadRelationTopology: vi.fn().mockResolvedValue({
        ...relationSnapshot(),
        availability: "unavailable",
        relationCompleteness: "unavailable",
        nodes: [],
        edges: [],
        counts: {
          filteredCount: null,
          unfilteredCount: null,
          filteredCountCompleteness: "unavailable",
          unfilteredCountCompleteness: "unavailable",
        },
        partialReasonCodes: ["topology_projection_unavailable"],
      }),
    });
    renderEnglishResources(
      "/resources?clusters=cluster-1&applications=checkout&view=map",
      unavailablePort,
    );

    expect(await screen.findByText("Graph data is not available yet")).toBeTruthy();
    expect(document.querySelector('[data-slot="relation-topology-node"]')).toBeNull();
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
    availability: "available",
    clusterId: "cluster-1",
    clusterProjectionRevision: 42,
    graphRevision: "graph-test",
    refreshAfterSeconds: 60,
    nodes: [
      {
        id: "deployment:shop/checkout-api",
        identity: {
          resourceType: "workload",
          kind: "Deployment",
          namespace: "shop",
          name: "checkout-api",
        },
        kind: "Deployment",
        name: "checkout-api",
        status: "Ready",
      },
      {
        id: "pod:shop/checkout-api-0",
        identity: {
          resourceType: "pod",
          kind: "Pod",
          namespace: "shop",
          name: "checkout-api-0",
        },
        kind: "Pod",
        name: "checkout-api-0",
        status: "CrashLoopBackOff",
      },
    ],
    edges: [
      { from: "deployment:shop/checkout-api", to: "pod:shop/checkout-api-0", type: "owns" },
    ],
    counts: {
      filteredCount: 2,
      unfilteredCount: 2,
      filteredCountCompleteness: "exact",
      unfilteredCountCompleteness: "exact",
    },
    relationCompleteness: "exact",
    partialReasonCodes: [],
    truncated: false,
    omittedNodeCount: 0,
    omittedEdgeCount: 0,
    snapshot: {
      snapshotRevision: 42,
      authorizationRevision: "auth-test",
      filterFingerprint: "filter-test",
      observedAt: "2026-07-14T05:00:00Z",
      stale: false,
      partialReasonCodes: [],
    },
  };
}

function readResourcesQuery(): URLSearchParams {
  const location = screen.getByTestId("resources-location").textContent ?? "";
  return new URL(location, "https://product.test").searchParams;
}

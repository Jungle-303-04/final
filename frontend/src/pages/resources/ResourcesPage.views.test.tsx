// @vitest-environment jsdom

import { cleanup, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { vi } from "vitest";
import type { TrafficPort } from "../../features/traffic/trafficContract";

import {
  renderResources,
  resourcesClusterPort,
  resourcesPhysicalTopologyPort,
  resourcesPort,
} from "./ResourcesPage.testSupport";

afterEach(cleanup);

describe("ResourcesPage view contract", () => {
  it("renders the map and list as mutually exclusive URL-backed views", async () => {
    const user = userEvent.setup();
    const rendered = renderResources(
      resourcesPort(),
      "/resources?clusters=cluster-1&resources.types=pod&view=list",
      resourcesClusterPort(),
      undefined,
      "en",
      undefined,
      resourcesPhysicalTopologyPort(),
    );

    expect(await screen.findByRole("table", { name: "Resource list" })).toBeTruthy();
    expect(document.querySelector('[data-slot="resources-graph-shell"]')).toBeNull();

    await user.click(screen.getByRole("button", { name: "Map" }));
    expect(await screen.findByRole("button", { name: "Include inactive resources" })).toBeTruthy();
    expect(screen.queryByRole("table", { name: "Resource list" })).toBeNull();
    expect(rendered.router.state.location.search).toContain("view=map");

    await user.click(screen.getByRole("button", { name: "List" }));
    expect(await screen.findByRole("table", { name: "Resource list" })).toBeTruthy();
    expect(document.querySelector('[data-slot="resources-graph-shell"]')).toBeNull();
    expect(rendered.router.state.location.search).not.toContain("resources.view");
    expect(rendered.router.state.location.search).toContain("view=list");
  });

  it("uses the real traffic port for the exclusive flow view and opens services in resource detail", async () => {
    const user = userEvent.setup();
    const trafficPort = trafficFlowPort();
    const rendered = renderResources(
      resourcesPort(),
      "/resources?view=flow",
      resourcesClusterPort(),
      undefined,
      "en",
      undefined,
      resourcesPhysicalTopologyPort(),
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      trafficPort,
    );

    expect(await screen.findByRole("region", { name: "Flow map" })).toBeTruthy();
    expect(screen.queryByRole("table", { name: "Resource list" })).toBeNull();
    expect(document.querySelector('[data-slot="resources-graph-shell"]')).toBeNull();
    expect(trafficPort.getOverview).toHaveBeenCalledWith(
      expect.objectContaining({ clusterIds: [], namespaces: [] }),
      expect.any(AbortSignal),
    );

    await user.click((await screen.findAllByRole("button", { name: /checkout/ }))[0]!);
    expect(rendered.router.state.location.search).toContain("clusters=cluster-1");
    expect(rendered.router.state.location.search).toContain("resources.types=service");
    expect(rendered.router.state.location.search).toContain("detail=Service%2Fshop%2Fcheckout");
  });
});

function trafficFlowPort(): TrafficPort {
  return {
    getOverview: vi.fn().mockResolvedValue({
      scopeCoverage: {
        availability: "available",
        scopes: [],
        observedAt: "2026-07-19T00:00:00Z",
        reasonCodes: [],
      },
      observation: {
        availability: "available",
        observedAt: "2026-07-19T00:00:00Z",
        since: "5m",
        sourceKeys: ["cilium"],
        reasonCodes: [],
      },
      summary: {
        availability: "available",
        totalFlowCount: 1,
        deniedFlowCount: 0,
        externalFlowCount: 0,
        reasonCodes: [],
      },
      relationships: {
        availability: "available",
        edges: [{
          flowId: "a".repeat(64),
          sourceKey: "cilium",
          source: {
            clusterId: "cluster-1",
            name: "checkout-abc",
            namespace: "shop",
            kind: "Pod",
            workload: "checkout",
            service: "checkout",
            ip: "10.0.0.1",
            identityStability: "provider_observed",
          },
          target: {
            clusterId: "cluster-1",
            name: "payments",
            namespace: "shop",
            kind: "Service",
            workload: null,
            service: "payments",
            ip: "10.0.0.2",
            identityStability: "provider_observed",
          },
          protocol: "http",
          port: 8080,
          verdict: "forwarded",
          connections: 12,
          bytesSent: null,
          bytesReceived: null,
          observedAt: "2026-07-19T00:00:00Z",
        }],
        totalCount: 1,
        hasMore: false,
        nextCursor: null,
        facets: { protocols: [], verdicts: [] },
        reasonCodes: [],
      },
      refreshAfterSeconds: 30,
    }),
    getSources: vi.fn().mockResolvedValue({
      availability: "available",
      coverage: {
        availability: "available",
        scopes: [],
        observedAt: "2026-07-19T00:00:00Z",
        reasonCodes: [],
      },
      clusters: [],
      reasonCodes: [],
    }),
    selectSource: vi.fn(),
    connectSource: vi.fn(),
  };
}

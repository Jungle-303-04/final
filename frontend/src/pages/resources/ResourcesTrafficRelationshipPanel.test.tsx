// @vitest-environment jsdom

import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { TrafficOverview } from "../../features/traffic/trafficContract";
import { I18nProvider } from "../../shared/i18n";
import {
  projectTrafficServices,
  ResourcesTrafficRelationshipPanel,
} from "./ResourcesTrafficRelationshipPanel";

afterEach(cleanup);

describe("ResourcesTrafficRelationshipPanel", () => {
  it("aggregates only observed service relationships and keeps focus separate from detail", async () => {
    const overview = trafficOverview();
    expect(projectTrafficServices(overview)).toEqual([
      expect.objectContaining({
        connections: 19,
        unhealthyEdges: 1,
        endpoint: expect.objectContaining({ name: "checkout" }),
        metricAvailability: "available",
        ratePerSecond: 48.2,
        errorRatePercent: 2.4,
      }),
      expect.objectContaining({
        connections: 19,
        unhealthyEdges: 1,
        endpoint: expect.objectContaining({ name: "payments" }),
        metricAvailability: "partial",
        ratePerSecond: null,
        errorRatePercent: null,
      }),
    ]);

    const user = userEvent.setup();
    const onFocus = vi.fn();
    const onOpen = vi.fn();
    render(
      <I18nProvider navigatorLanguage="ko-KR" storage={null}>
        <ResourcesTrafficRelationshipPanel
          focusedService={null}
          loading={false}
          onFocus={onFocus}
          onOpen={onOpen}
          overview={overview}
        />
      </I18nProvider>,
    );

    const checkout = screen.getByRole("button", { name: /checkout/u });
    expect(within(checkout).getByText("48.2 req/s")).toBeTruthy();
    expect(within(checkout).getByText("오류 2.4%")).toBeTruthy();
    const payments = screen.getByRole("button", { name: /payments/u });
    expect(within(payments).getByText("부분 수집")).toBeTruthy();
    expect(within(payments).getByText("오류 —")).toBeTruthy();
    await user.click(checkout);
    expect(onFocus).toHaveBeenCalledWith(expect.objectContaining({
      endpoint: expect.objectContaining({ name: "checkout" }),
    }));
    await user.dblClick(checkout);
    expect(onOpen).toHaveBeenCalledWith(expect.objectContaining({ name: "checkout" }));
  });
});

function trafficOverview(): TrafficOverview {
  return {
    scopeCoverage: {
      availability: "available",
      scopes: [],
      observedAt: "2026-07-20T00:00:00Z",
      reasonCodes: [],
    },
    observation: {
      availability: "available",
      observedAt: "2026-07-20T00:00:00Z",
      since: "5m",
      sourceKeys: ["hubble"],
      reasonCodes: [],
    },
    summary: {
      availability: "available",
      totalFlowCount: 2,
      deniedFlowCount: 1,
      externalFlowCount: 0,
      reasonCodes: [],
    },
    relationships: {
      availability: "available",
      edges: [relationship("flow-1", "forwarded", 12), relationship("flow-2", "error", 7)],
      totalCount: 2,
      hasMore: false,
      nextCursor: null,
      facets: { protocols: [], verdicts: [] },
      reasonCodes: [],
    },
    serviceMetrics: [{
      availability: "available",
      clusterId: "cluster-1",
      namespace: "shop",
      service: "checkout",
      ratePerSecond: 48.2,
      rateUnit: "requests",
      errorRatePercent: 2.4,
      observedAt: "2026-07-20T00:00:00Z",
      sourceKeys: ["prometheus"],
      reasonCodes: [],
    }, {
      availability: "partial",
      clusterId: "cluster-1",
      namespace: "shop",
      service: "payments",
      ratePerSecond: null,
      rateUnit: null,
      errorRatePercent: null,
      observedAt: "2026-07-20T00:00:00Z",
      sourceKeys: ["hubble"],
      reasonCodes: ["request_metrics_unavailable"],
    }],
    refreshAfterSeconds: 30,
  };
}

function relationship(
  flowId: string,
  verdict: "forwarded" | "error",
  connections: number,
) {
  return {
    flowId,
    sourceKey: "hubble",
    source: {
      clusterId: "cluster-1",
      name: "checkout-abc",
      namespace: "shop",
      kind: "Pod",
      workload: "checkout",
      service: "checkout",
      ip: "10.0.0.1",
      identityStability: "provider_observed" as const,
    },
    target: {
      clusterId: "cluster-1",
      name: "payments",
      namespace: "shop",
      kind: "Service",
      workload: null,
      service: "payments",
      ip: "10.0.0.2",
      identityStability: "provider_observed" as const,
    },
    protocol: "http" as const,
    port: 8080,
    verdict,
    connections,
    bytesSent: null,
    bytesReceived: null,
    observedAt: "2026-07-20T00:00:00Z",
  };
}

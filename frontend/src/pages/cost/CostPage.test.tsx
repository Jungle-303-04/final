// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CostPortFailure, type CostPort } from "../../features/cost/costContract";
import type { RightsizingPort } from "../../features/rightsizing/rightsizingContract";
import { I18nProvider } from "../../shared/i18n";
import { UnifiedFilterProvider } from "../../features/filters/UnifiedFilterProvider";
import { CostPage } from "./CostPage";

const scopeState = vi.hoisted(() => ({ value: null as unknown }));

vi.mock("../../features/cluster-scope/ClusterScopeProvider", () => ({
  useClusterScope: () => scopeState.value,
}));

afterEach(() => cleanup());

beforeEach(() => {
  scopeState.value = { selection: { kind: "selected", cluster: { id: "cluster-a" } } };
});

describe("CostPage", () => {
  it("shows unavailable observation rather than invented currency, zero, or recommendations", async () => {
    const port = costPort();
    renderCostPage(port);

    expect(await screen.findByRole("heading", { name: "Cost" })).toBeTruthy();
    expect(screen.getByText("Cost observation is not integrated for this authorized scope.")).toBeTruthy();
    expect(screen.getAllByText("Not observed").length).toBeGreaterThan(0);
    expect(screen.queryByText("cost_observation_not_integrated")).toBeNull();
    expect(screen.queryByText("inventory_snapshot_unavailable:cluster-a")).toBeNull();
    expect(screen.queryByText("0")).toBeNull();
    expect(screen.queryByText("USD")).toBeNull();
    expect(screen.queryByText("$")).toBeNull();
    expect(await screen.findByText("Node cost evidence")).toBeTruthy();
    expect(screen.getByText("node-a")).toBeTruthy();
    expect(screen.getAllByText("Not observed").length).toBeGreaterThan(0);
    await waitFor(() => expect(port.getOverview).toHaveBeenCalledWith({
      clusterIds: ["cluster-a"],
      namespaces: [],
      timeRange: "24h",
    }, expect.any(AbortSignal)));
    await waitFor(() => expect(port.getNodes).toHaveBeenCalledWith({
      clusterIds: ["cluster-a"],
      namespaces: [],
      limit: 50,
    }, expect.any(AbortSignal)));
  });

  it("renders a forbidden response without querying a replacement scope", async () => {
    const port = costPort(new CostPortFailure("forbidden"));
    renderCostPage(port);

    expect(await screen.findByText("You cannot access this scope")).toBeTruthy();
    expect(port.getOverview).toHaveBeenCalledTimes(1);
  });

  it("does not query while cluster authority is resolving", () => {
    scopeState.value = { selection: { kind: "resolving", requestedIds: [] } };
    const port = costPort();
    renderCostPage(port);
    expect(port.getOverview).not.toHaveBeenCalled();
  });

  it("preserves unrelated search state while cost tabs and ranges change", async () => {
    const port = costPort();
    renderCostPage(port, "/cost?clusters=cluster-a&namespaces=cluster-a%2Fshop");

    fireEvent.click(screen.getByRole("tab", { name: "Allocation trend" }));
    expect(screen.getByTestId("location").textContent).toContain("clusters=cluster-a");
    expect(screen.getByTestId("location").textContent).toContain("namespaces=cluster-a%2Fshop");
    expect(screen.getByTestId("location").textContent).toContain("tab=trend");
    fireEvent.click(await screen.findByRole("button", { name: "7 days" }));

    await waitFor(() => expect(port.getOverview).toHaveBeenLastCalledWith({
      clusterIds: ["cluster-a"],
      namespaces: ["cluster-a/shop"],
      timeRange: "7d",
    }, expect.any(AbortSignal)));
    expect(screen.getByTestId("location").textContent).toContain("cost.range=7d");
  });

  it("keeps the route stable while supplemental node evidence is still loading", async () => {
    const port = costPort();
    port.getNodes = vi.fn().mockReturnValue(new Promise(() => undefined));
    renderCostPage(port);

    expect(await screen.findByRole("heading", { name: "Cost" })).toBeTruthy();
    expect(await screen.findByLabelText("Node cost evidence")).toBeTruthy();
    expect(document.querySelector('[data-product-state="loading"]')).toBeNull();
  });
});

function costPort(error?: CostPortFailure): CostPort & { getOverview: ReturnType<typeof vi.fn> } {
  return {
    loadRefreshPolicy: vi.fn().mockResolvedValue({
      staleAfterSeconds: 30,
      refreshAfterSeconds: 60,
      keepLastSuccess: true,
      pauseWhenHidden: true,
      eventInvalidation: false,
      retryAfterSeconds: null,
      retryLimit: null,
      postMutationRefreshAfterSeconds: null,
    }),
    getOverview: vi.fn().mockImplementation(() => error ? Promise.reject(error) : Promise.resolve({
      scopeCoverage: {
        availability: "available",
        scopes: [{ workspaceId: "workspace-a", clusterId: "cluster-a", namespaces: [], freshness: "live" }],
        observedAt: "2026-07-16T09:00:00Z",
        reasonCodes: [],
      },
      observation: { availability: "unavailable", observedAt: null, currency: null, dataWindow: null, reasonCodes: ["cost_observation_not_integrated"] },
      summary: {
        availability: "unavailable",
        hourlyCost: null,
        monthlyProjection: null,
        storageCost: null,
        idleCost: null,
        efficiency: null,
        savingsRecommendations: null,
        reasonCodes: ["cost_observation_not_integrated"],
      },
      trend: {
        availability: "unavailable" as const,
        timeRange: "24h" as const,
        currency: null,
        series: [] as const,
        reasonCodes: ["cost_observation_not_integrated"],
      },
    })),
    getNodes: vi.fn().mockImplementation(() => error ? Promise.reject(error) : Promise.resolve({
      scopeCoverage: {
        availability: "available" as const,
        scopes: [{ workspaceId: "workspace-a", clusterId: "cluster-a", namespaces: [], freshness: "live" as const }],
        observedAt: "2026-07-16T09:00:00Z",
        reasonCodes: [],
      },
      items: [{
        resource: { version: "v1", kind: "Node" as const, name: "node-a", uid: "uid-node-a" },
        clusterId: "cluster-a",
        clusterName: "prod",
        provider: "eks",
        providerId: "aws:///zone/i-123",
        instanceType: "m6i.large",
        zone: "ap-northeast-2a",
        capacityType: "spot",
        status: "Ready",
        observedAt: "2026-07-16T09:00:00Z",
        capacity: { cpuMillicores: 1900, memoryMib: 7168, pods: 58 },
        usage: {
          availability: "available" as const,
          observedAt: "2026-07-16T09:00:00Z",
          cpuMillicores: 950,
          memoryMib: 3584,
          cpuUtilizationPercent: 50,
          memoryUtilizationPercent: 50,
          reasonCodes: [],
        },
        pricing: {
          availability: "unavailable" as const,
          currency: null,
          hourlyRateMicros: null,
          reasonCodes: ["node_pricing_observation_not_integrated"],
        },
      }],
      total: 1,
      countCompleteness: "exact" as const,
      hasMore: false,
      nextCursor: null,
      snapshotRevision: 1,
      pricingCoverage: {
        availability: "unavailable" as const,
        reasonCodes: ["node_pricing_observation_not_integrated"],
      },
    })),
  };
}

function renderCostPage(port: CostPort, entry = "/cost") {
  return render(
    <I18nProvider navigatorLanguage="en" storage={null}>
      <MemoryRouter initialEntries={[entry]}>
        <UnifiedFilterProvider>
          <CostPage port={port} rightsizingPort={rightsizingPort()} />
          <LocationProbe />
        </UnifiedFilterProvider>
      </MemoryRouter>
    </I18nProvider>,
  );
}

function rightsizingPort(): RightsizingPort {
  return {
    getScan: vi.fn().mockResolvedValue({
      scope: {
        workspaceId: "workspace-a",
        clusterId: "cluster-a",
        namespaces: [],
        freshness: "live",
      },
      namespaceScope: [],
      result: {
        availability: "unavailable",
        reasonCodes: ["rightsizing_observation_not_integrated"],
      },
      refreshAfterSeconds: 60,
    }),
  };
}

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location">{location.pathname}{location.search}</output>;
}

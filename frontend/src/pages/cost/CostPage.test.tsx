// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CostPortFailure, type CostPort } from "../../features/cost/costContract";
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
    render(<MemoryRouter><CostPage port={port} /></MemoryRouter>);

    expect(await screen.findByRole("heading", { name: "Cost" })).toBeTruthy();
    expect(screen.getByText("Cost observation is not integrated for this authorized scope.")).toBeTruthy();
    expect(screen.getAllByText("Not observed").length).toBeGreaterThan(0);
    expect(screen.queryByText("cost_observation_not_integrated")).toBeNull();
    expect(screen.queryByText("inventory_snapshot_unavailable:cluster-a")).toBeNull();
    expect(screen.queryByText("0")).toBeNull();
    expect(screen.queryByText("USD")).toBeNull();
    expect(screen.queryByText("$")).toBeNull();
    await waitFor(() => expect(port.getOverview).toHaveBeenCalledWith({ clusterIds: ["cluster-a"] }, expect.any(AbortSignal)));
  });

  it("renders a forbidden response without querying a replacement scope", async () => {
    const port = costPort(new CostPortFailure("forbidden"));
    render(<MemoryRouter><CostPage port={port} /></MemoryRouter>);

    expect(await screen.findByText("You cannot access this scope")).toBeTruthy();
    expect(port.getOverview).toHaveBeenCalledTimes(1);
  });

  it("does not query while cluster authority is resolving", () => {
    scopeState.value = { selection: { kind: "resolving", requestedIds: [] } };
    const port = costPort();
    render(<MemoryRouter><CostPage port={port} /></MemoryRouter>);
    expect(port.getOverview).not.toHaveBeenCalled();
  });
});

function costPort(error?: CostPortFailure): CostPort & { getOverview: ReturnType<typeof vi.fn> } {
  return {
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
      refreshAfterSeconds: 60,
    })),
  };
}

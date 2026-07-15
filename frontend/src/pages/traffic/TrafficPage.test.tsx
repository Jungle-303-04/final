// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { TrafficPort } from "../../features/traffic/trafficContract";
import { TrafficPage } from "./TrafficPage";

const scopeState = vi.hoisted(() => ({ value: null as unknown }));
const filterState = vi.hoisted(() => ({ value: null as unknown }));

vi.mock("../../features/cluster-scope/ClusterScopeProvider", () => ({
  useClusterScope: () => scopeState.value,
}));
vi.mock("../../features/filters/UnifiedFilterProvider", () => ({
  useUnifiedFilter: () => filterState.value,
}));

afterEach(() => cleanup());

beforeEach(() => {
  scopeState.value = { selection: { kind: "selected", cluster: { id: "cluster-a" } } };
  filterState.value = { state: { common: { namespaces: [{ clusterId: "cluster-a", namespace: "storefront" }] } } };
});

describe("TrafficPage", () => {
  it("does not query an unbounded scope while cluster authority is still resolving", () => {
    scopeState.value = { selection: { kind: "resolving", requestedIds: [] } };
    const port = trafficPort();

    render(<MemoryRouter><TrafficPage port={port} /></MemoryRouter>);

    expect(port.getOverview).not.toHaveBeenCalled();
  });

  it("shows collector absence and null data rather than a fabricated empty traffic graph", async () => {
    const port = trafficPort();
    render(
      <MemoryRouter><TrafficPage port={port} /></MemoryRouter>,
    );

    expect(await screen.findByRole("heading", { name: "Traffic" })).toBeTruthy();
    expect(screen.getByText("Traffic flow evidence is not collected for this scope.")).toBeTruthy();
    expect(screen.getAllByText("Not observed").length).toBeGreaterThan(0);
    expect(screen.getAllByText("traffic_observation_not_integrated").length).toBeGreaterThan(0);
    expect(screen.queryByText("0")).toBeNull();
    await waitFor(() => expect(port.getOverview).toHaveBeenCalledWith({
      clusterIds: ["cluster-a"],
      namespaces: ["cluster-a/storefront"],
    }, expect.any(AbortSignal)));
  });
});

function trafficPort(): TrafficPort & { getOverview: ReturnType<typeof vi.fn> } {
  return {
    getOverview: vi.fn().mockResolvedValue({
      scopeCoverage: {
        availability: "available",
        scopes: [{ workspaceId: "workspace-a", clusterId: "cluster-a", namespaces: ["storefront"], freshness: "live" }],
        observedAt: "2026-07-16T09:00:00Z",
        reasonCodes: [],
      },
      observation: {
        availability: "unavailable",
        observedAt: null,
        reasonCodes: ["traffic_observation_not_integrated"],
      },
      summary: {
        availability: "unavailable",
        totalFlowCount: null,
        deniedFlowCount: null,
        externalFlowCount: null,
        reasonCodes: ["traffic_observation_not_integrated"],
      },
      relationships: {
        availability: "unavailable",
        edges: null,
        reasonCodes: ["traffic_observation_not_integrated"],
      },
    }),
  };
}

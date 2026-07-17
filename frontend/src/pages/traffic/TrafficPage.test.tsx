// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
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

  it("renders source actions from server descriptors and hands accepted work to the operation stream", async () => {
    const port = trafficPort();
    render(<MemoryRouter><TrafficPage port={port} /></MemoryRouter>);

    fireEvent.click(await screen.findByRole("button", { name: "Connect Hubble" }));
    expect(screen.getByRole("dialog", { name: "Connect Hubble" })).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Reason"), {
      target: { value: "Connect the observed relay" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Confirm Connect Hubble" }));

    await waitFor(() => expect(port.connectSource).toHaveBeenCalledWith({
      scope: {
        workspaceId: "workspace-a",
        clusterId: "cluster-a",
        namespaces: [],
        freshness: "live",
      },
      sourceKey: "hubble",
      capabilityRevision: "a".repeat(64),
      confirmation: true,
      idempotencyKey: expect.any(String),
      reason: "Connect the observed relay",
    }, expect.any(AbortSignal)));
    expect(await screen.findByText(/corr-traffic-1/)).toBeTruthy();
  });
});

function trafficPort(): TrafficPort & {
  getOverview: ReturnType<typeof vi.fn>;
  getSources: ReturnType<typeof vi.fn>;
  selectSource: ReturnType<typeof vi.fn>;
  connectSource: ReturnType<typeof vi.fn>;
} {
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
    getSources: vi.fn().mockResolvedValue({
      availability: "available",
      coverage: {
        availability: "available",
        scopes: [{
          workspaceId: "workspace-a",
          clusterId: "cluster-a",
          namespaces: [],
          freshness: "live",
        }],
        observedAt: "2026-07-17T01:00:00Z",
        reasonCodes: [],
      },
      clusters: [{
        scope: {
          workspaceId: "workspace-a",
          clusterId: "cluster-a",
          namespaces: [],
          freshness: "live",
        },
        freshness: "live",
        observedAt: "2026-07-17T01:00:00Z",
        activeSource: "hubble",
        capabilityRevision: "a".repeat(64),
        cluster: {
          platform: "eks",
          cni: "cilium",
          dataplaneV2: false,
          kubernetesVersion: "v1.33.1",
        },
        sources: [{
          key: "hubble",
          label: "Hubble",
          status: "available",
          version: "1.17.2",
          native: true,
          message: "relay endpoints are ready",
          actions: [{
            id: "connect",
            kind: "connect",
            label: "Connect Hubble",
            enabled: true,
            confirmationRequired: true,
            reasonCode: null,
          }],
        }],
        reasonCodes: [],
      }],
      reasonCodes: [],
    }),
    selectSource: vi.fn(),
    connectSource: vi.fn().mockResolvedValue({
      accepted: true,
      commandId: "cmd-traffic-1",
      eventId: "evt-traffic-1",
      auditEventId: "evt-traffic-1",
      correlationId: "corr-traffic-1",
      status: "queued",
    }),
  };
}

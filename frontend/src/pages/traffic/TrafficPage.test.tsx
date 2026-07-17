// @vitest-environment jsdom

import { cleanup, fireEvent, render as testingRender, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { TrafficPort } from "../../features/traffic/trafficContract";
import { I18nProvider } from "../../shared/i18n";
import { TrafficPage } from "./TrafficPage";

function render(ui: Parameters<typeof testingRender>[0]) {
  return testingRender(ui, {
    wrapper: ({ children }) => (
      <I18nProvider navigatorLanguage="en-US" storage={null}>{children}</I18nProvider>
    ),
  });
}

interface TestScopeState {
  selection: unknown;
  scopeInvalidationRevision?: number;
}

interface TestFilterState {
  detail: Record<string, unknown>;
  state: { common: { namespaces: { clusterId: string; namespace: string }[] } };
  updateDetail: ReturnType<typeof vi.fn>;
}

const scopeState = vi.hoisted(() => ({ value: null as unknown as TestScopeState }));
const filterState = vi.hoisted(() => ({ value: null as unknown as TestFilterState }));

vi.mock("../../features/cluster-scope/ClusterScopeProvider", () => ({
  useClusterScope: () => scopeState.value,
}));
vi.mock("../../features/filters/UnifiedFilterProvider", () => ({
  useUnifiedFilter: () => filterState.value,
}));

afterEach(() => cleanup());

beforeEach(() => {
  scopeState.value = {
    selection: { kind: "selected", cluster: { id: "cluster-a" } },
    scopeInvalidationRevision: 0,
  };
  filterState.value = {
    detail: {},
    state: { common: { namespaces: [{ clusterId: "cluster-a", namespace: "storefront" }] } },
    updateDetail: vi.fn(),
  };
});

describe("TrafficPage", () => {
  it("localizes product controls while preserving server action labels", async () => {
    const port = trafficPort();
    testingRender(
      <I18nProvider navigatorLanguage="ko" storage={null}>
        <MemoryRouter><TrafficPage port={port} /></MemoryRouter>
      </I18nProvider>,
    );

    expect(await screen.findByRole("heading", { name: "트래픽" })).toBeTruthy();
    expect(screen.getByText("트래픽 소스")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Connect Hubble" })).toBeTruthy();
  });

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
      since: "5m",
      protocols: [],
      verdicts: [],
      sort: "connections",
      order: "desc",
      cursor: undefined,
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

  it("renders observed Agent flows and keeps filter and drawer state in the shared URL contract", async () => {
    const port = trafficPort();
    port.getOverview.mockResolvedValueOnce(observedOverview());

    render(<MemoryRouter><TrafficPage port={port} /></MemoryRouter>);

    expect(await screen.findByText("Observed traffic from caretta through the outbound cluster agent.")).toBeTruthy();
    expect(screen.getByRole("list", { name: "Flow map" })).toBeTruthy();
    fireEvent.click(screen.getAllByRole("button", { name: /web/ })[0]);
    expect(filterState.value.updateDetail).toHaveBeenCalledWith(expect.any(Function), "traffic-flow");
    const selectFlowCalls = filterState.value.updateDetail.mock.calls;
    const selectFlow = selectFlowCalls[selectFlowCalls.length - 1]?.[0];
    expect(selectFlow({})).toMatchObject({ trafficFlow: "a".repeat(64) });

    fireEvent.change(screen.getByLabelText("Time range"), { target: { value: "15m" } });
    expect(filterState.value.updateDetail).toHaveBeenCalledWith(expect.any(Function), "traffic-filter");
    const updateFilterCalls = filterState.value.updateDetail.mock.calls;
    const updateFilter = updateFilterCalls[updateFilterCalls.length - 1]?.[0];
    expect(updateFilter({ trafficCursor: "old", trafficFlow: "old" })).toMatchObject({
      trafficSince: "15m",
      trafficCursor: null,
      trafficFlow: null,
    });
  });

  it("refreshes through the existing cluster Agent invalidation revision", async () => {
    const port = trafficPort();
    const view = render(<MemoryRouter><TrafficPage port={port} /></MemoryRouter>);
    await waitFor(() => expect(port.getOverview).toHaveBeenCalledTimes(1));

    scopeState.value = { ...scopeState.value, scopeInvalidationRevision: 1 };
    view.rerender(<MemoryRouter><TrafficPage port={port} /></MemoryRouter>);

    await waitFor(() => expect(port.getOverview).toHaveBeenCalledTimes(2));
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
      refreshAfterSeconds: 60,
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
    selectSource: vi.fn().mockResolvedValue(commandReceipt()),
    connectSource: vi.fn().mockResolvedValue({
      ...commandReceipt(),
    }),
  };
}

function commandReceipt() {
  return {
    accepted: true as const,
    commandId: "cmd-traffic-1",
    eventId: "evt-traffic-1",
    auditEventId: "evt-traffic-1",
    correlationId: "corr-traffic-1",
    status: "queued" as const,
  };
}

function observedOverview() {
  const source = {
    clusterId: "cluster-a",
    name: "web",
    namespace: "storefront",
    kind: "Workload",
    workload: "web",
    service: null,
    ip: null,
    identityStability: "provider_observed" as const,
  };
  return {
    scopeCoverage: {
      availability: "available" as const,
      scopes: [{
        workspaceId: "workspace-a",
        clusterId: "cluster-a",
        namespaces: ["storefront"],
        freshness: "live" as const,
      }],
      observedAt: "2026-07-18T01:00:00Z",
      reasonCodes: [],
    },
    observation: {
      availability: "available" as const,
      observedAt: "2026-07-18T01:00:00Z",
      since: "5m" as const,
      sourceKeys: ["caretta"],
      reasonCodes: [],
    },
    summary: {
      availability: "available" as const,
      totalFlowCount: 1,
      deniedFlowCount: 0,
      externalFlowCount: 0,
      reasonCodes: [],
    },
    relationships: {
      availability: "available" as const,
      edges: [{
        flowId: "a".repeat(64),
        sourceKey: "caretta",
        source,
        target: { ...source, name: "api", workload: "api" },
        protocol: "tcp" as const,
        port: 8080,
        verdict: "forwarded" as const,
        connections: 42,
        bytesSent: null,
        bytesReceived: null,
        observedAt: "2026-07-18T01:00:00Z",
      }],
      totalCount: 1,
      hasMore: false,
      nextCursor: null,
      facets: {
        protocols: [{ value: "tcp" as const, count: 1 }],
        verdicts: [{ value: "forwarded" as const, count: 1 }],
      },
      reasonCodes: [],
    },
    refreshAfterSeconds: 60,
  };
}

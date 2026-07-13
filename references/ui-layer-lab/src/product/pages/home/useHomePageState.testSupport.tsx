import { act, renderHook } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { vi } from "vitest";
import { AuthSessionGateProvider } from "../../features/auth/AuthSessionGate";
import { ClusterScopeProvider } from "../../features/cluster-scope/ClusterScopeProvider";
import type {
  HomeClusterChoices,
  HomeClusterOverview,
  HomeNodeCollection,
  HomePodCollection,
  HomePort,
} from "../../features/home/homeContract";
import { useHomePageState } from "./useHomePageState";

export function renderHomeState(port: HomePort, entry: string) {
  return renderHook(() => useHomePageState(port), {
    wrapper: ({ children }) => (
      <MemoryRouter initialEntries={[entry]}>
        <AuthSessionGateProvider reportUnauthorized={vi.fn()}>
          <ClusterScopeProvider authorityKey="test-workspace:test-user" port={port}>
            {children}
          </ClusterScopeProvider>
        </AuthSessionGateProvider>
      </MemoryRouter>
    ),
  });
}

export function homeApi() {
  const list = vi.fn<(...args: [AbortSignal?]) => Promise<HomeClusterChoices>>()
    .mockResolvedValue(clusterChoices());
  const overviewMock = vi.fn<(...args: [string, AbortSignal?]) => Promise<HomeClusterOverview>>()
    .mockImplementation((clusterId) => Promise.resolve(overview(clusterId, clusterId)));
  const nodesMock = vi.fn<(...args: [string, AbortSignal?]) => Promise<HomeNodeCollection>>()
    .mockImplementation((clusterId) => Promise.resolve(nodes(clusterId, ["worker-a"])));
  const podsMock = vi.fn<(...args: [string, string, AbortSignal?]) => Promise<HomePodCollection>>()
    .mockImplementation((clusterId, nodeName) => Promise.resolve(pods(clusterId, nodeName)));
  return {
    list,
    overview: overviewMock,
    nodes: nodesMock,
    pods: podsMock,
    port: {
      listClusterChoices: list,
      loadClusterOverview: overviewMock,
      loadNodes: nodesMock,
      loadNodePods: podsMock,
    } satisfies HomePort,
  };
}

export function clusterChoices(): HomeClusterChoices {
  return {
    completeness: "unknown",
    clusters: ["cluster-a", "cluster-b"].map((id) => ({
      id,
      workspaceId: "workspace-main",
      name: id,
      environment: "production",
      registrationState: "active",
      connectionState: "online",
      lastObservedAt: "2026-07-12T10:00:00.000Z",
      nodeCount: 1,
      podCount: 1,
      incidentCount: 0,
    })),
  };
}

export function overview(clusterId: string, name: string): HomeClusterOverview {
  return {
    clusterId,
    name,
    health: "healthy",
    usage: null,
    workloads: [],
    warnings: [],
    incidents: [],
    dataQualityWarnings: [],
  };
}

export function nodes(clusterId: string, names: string[]): HomeNodeCollection {
  return {
    clusterId,
    completeness: "unknown",
    nodes: names.map((name) => ({
      id: `node:${clusterId}/${name}`,
      identityStability: "ephemeral",
      name,
      ready: true,
      health: "healthy",
      podsRunning: 1,
      podsCapacity: 10,
      cpuPercent: 10,
      memoryPercent: 20,
      restartCount: 0,
      conditions: [],
    })),
  };
}

export function pods(clusterId: string, nodeName: string): HomePodCollection {
  return { clusterId, nodeName, completeness: "unknown", pods: [] };
}

export function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((onResolve, onReject) => {
    resolve = onResolve;
    reject = onReject;
  });
  return { promise, reject, resolve };
}

export function setVisibility(value: DocumentVisibilityState) {
  Object.defineProperty(document, "visibilityState", { configurable: true, value });
}

export async function flushEffects() {
  await act(async () => flushPromises());
}

export async function flushPromises() {
  for (let index = 0; index < 8; index += 1) await Promise.resolve();
}

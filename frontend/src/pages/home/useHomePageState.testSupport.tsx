import { act, renderHook } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { vi } from "vitest";
import { AuthSessionGateProvider } from "../../features/auth/AuthSessionGate";
import { ClusterScopeProvider } from "../../features/cluster-scope/ClusterScopeProvider";
import { UnifiedFilterProvider } from "../../features/filters/UnifiedFilterProvider";
import type {
  HomeClusterChoices,
  HomeClusterOverview,
  HomeDashboardInvalidation,
  HomeInsights,
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
          <UnifiedFilterProvider>
            <ClusterScopeProvider authorityKey="test-workspace:test-user" port={port}>
              {children}
            </ClusterScopeProvider>
          </UnifiedFilterProvider>
        </AuthSessionGateProvider>
      </MemoryRouter>
    ),
  });
}

export function homeApi(refreshAfterSeconds = 30) {
  const dashboardStreams: DashboardInvalidationStream[] = [];
  const list = vi.fn<(...args: [AbortSignal?]) => Promise<HomeClusterChoices>>()
    .mockResolvedValue(clusterChoices());
  const overviewMock = vi.fn<(...args: [string, AbortSignal?]) => Promise<HomeClusterOverview>>()
    .mockImplementation((clusterId) => Promise.resolve(overview(clusterId, clusterId)));
  const nodesMock = vi.fn<(...args: [string, AbortSignal?]) => Promise<HomeNodeCollection>>()
    .mockImplementation((clusterId) => Promise.resolve(nodes(clusterId, ["worker-a"])));
  const podsMock = vi.fn<(...args: [string, string, AbortSignal?]) => Promise<HomePodCollection>>()
    .mockImplementation((clusterId, nodeName) => Promise.resolve(pods(clusterId, nodeName)));
  const insightsMock = vi.fn<(...args: [string, AbortSignal?]) => Promise<HomeInsights>>()
    .mockImplementation((clusterId) => Promise.resolve(insights(clusterId)));
  return {
    insights: insightsMock,
    list,
    overview: overviewMock,
    nodes: nodesMock,
    pods: podsMock,
    dashboardStreams,
    port: {
      loadDashboardRefreshPolicy: vi.fn().mockResolvedValue({
        staleAfterSeconds: 15,
        refreshAfterSeconds,
        keepLastSuccess: true,
        pauseWhenHidden: true,
        eventInvalidation: true,
        retryAfterSeconds: null,
        retryLimit: null,
        postMutationRefreshAfterSeconds: null,
      }),
      listClusterChoices: list,
      loadClusterOverview: overviewMock,
      loadInsights: insightsMock,
      loadNodes: nodesMock,
      loadNodePods: podsMock,
      subscribeDashboardInvalidations: vi.fn((clusterId, options) => {
        const stream = dashboardInvalidationStream(clusterId, options?.signal);
        dashboardStreams.push(stream);
        return stream.events;
      }),
    } satisfies HomePort,
  };
}

export interface DashboardInvalidationStream {
  readonly clusterId: string;
  readonly events: AsyncIterable<HomeDashboardInvalidation>;
  readonly signal: AbortSignal | undefined;
  close(): void;
  emit(snapshotId?: string): void;
}

function dashboardInvalidationStream(
  clusterId: string,
  signal: AbortSignal | undefined,
): DashboardInvalidationStream {
  const pending: HomeDashboardInvalidation[] = [];
  const readers: Array<(value: IteratorResult<HomeDashboardInvalidation>) => void> = [];
  let closed = false;
  const finish = () => {
    if (closed) return;
    closed = true;
    readers.splice(0).forEach((resolve) => resolve({ done: true, value: undefined }));
  };
  signal?.addEventListener("abort", finish, { once: true });
  return {
    clusterId,
    signal,
    close: finish,
    emit(snapshotId = `snapshot-${pending.length + 1}`) {
      if (closed) return;
      const event: HomeDashboardInvalidation = { snapshotId };
      const reader = readers.shift();
      if (reader) reader({ done: false, value: event });
      else pending.push(event);
    },
    events: {
      [Symbol.asyncIterator]() {
        return {
          next(): Promise<IteratorResult<HomeDashboardInvalidation>> {
            const event = pending.shift();
            if (event) return Promise.resolve({ done: false, value: event });
            if (closed || signal?.aborted) {
              return Promise.resolve({ done: true, value: undefined });
            }
            return new Promise((resolve) => readers.push(resolve));
          },
          return(): Promise<IteratorResult<HomeDashboardInvalidation>> {
            finish();
            return Promise.resolve({ done: true, value: undefined });
          },
        };
      },
    },
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
      provider: "unknown",
      connectionStage: null,
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
      kubernetesVersion: "v1.30.7",
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

export function insights(clusterId: string): HomeInsights {
  return {
    clusterId,
    customResources: {
      coverage: { availability: "available", observedAt: null, reasonCodes: [] },
      items: [],
      totalKinds: 0,
      totalResources: 0,
      hasMore: false,
    },
    helm: {
      coverage: { availability: "available", observedAt: null, reasonCodes: [] },
      releaseCount: 0,
      statusCounts: {},
    },
    certificateExpiry: {
      coverage: {
        availability: "unavailable",
        observedAt: null,
        reasonCodes: ["tls_secret_observation_unavailable"],
      },
      items: [],
      tlsSecretCount: null,
      observedExpiryCount: null,
      expiringCount: null,
      expiredCount: null,
      earliestExpiry: null,
      warningBeforeSeconds: 2_592_000,
      hasMore: false,
    },
    refreshAfterSeconds: 30,
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

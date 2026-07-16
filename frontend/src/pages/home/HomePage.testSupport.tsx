import { render } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { vi } from "vitest";
import { AuthSessionGateProvider } from "../../features/auth/AuthSessionGate";
import { ClusterScopeProvider } from "../../features/cluster-scope/ClusterScopeProvider";
import { UnifiedFilterProvider } from "../../features/filters/UnifiedFilterProvider";
import type {
  HomeClusterChoices,
  HomeClusterOverview,
  HomeInsights,
  HomeNodeCollection,
  HomePodCollection,
  HomePort,
} from "../../features/home/homeContract";
import { I18nProvider } from "../../shared/i18n/I18nProvider";
import type { SupportedLocale } from "../../shared/i18n/types";
import { HomePage } from "./HomePage";

export const CLUSTERS: HomeClusterChoices = {
  completeness: "unknown",
  clusters: [
    {
      id: "cluster-1",
      workspaceId: "workspace-main",
      name: "cluster-1",
      environment: "production",
      provider: "eks",
      connectionStage: null,
      registrationState: "active",
      connectionState: "online",
      lastObservedAt: "2026-07-12T10:00:00.000Z",
      nodeCount: 2,
      podCount: 18,
      incidentCount: 1,
    },
    {
      id: "kubernetes-ops",
      workspaceId: "workspace-main",
      name: "kubernetes-ops",
      environment: "management",
      provider: "unknown",
      connectionStage: null,
      registrationState: "active",
      connectionState: "online",
      lastObservedAt: "2026-07-12T10:00:00.000Z",
      nodeCount: 1,
      podCount: 4,
      incidentCount: 0,
    },
  ],
};

export const OVERVIEW: HomeClusterOverview = {
  clusterId: "cluster-1",
  name: "cluster-1",
  health: "warning",
  usage: {
    observedAt: "2026-07-12T10:00:00.000Z",
    podsRunning: 17,
    podsTotal: 18,
    nodesReady: 2,
    nodesTotal: 2,
    restartCount: 3,
    cpuPercent: 42.5,
    memoryPercent: 61.25,
  },
  workloads: [],
  warnings: [{
    id: "warning:cluster-1/shop/checkout-warning",
    identityStability: "ephemeral",
    name: "checkout-warning",
    namespace: "shop",
    reason: "BackOff",
    message: "Container is restarting",
    involvedKind: "Pod",
    involvedName: "checkout-api-0",
    occurrenceCount: 2,
    lastSeenAt: "2026-07-12T09:59:00.000Z",
  }],
  incidents: [{
    id: "incident-1",
    incidentId: "incident-1",
    correlationId: "correlation-1",
    symptom: "Restart loop",
    rootCause: null,
    namespace: "shop",
    resourceKind: "Pod",
    resourceName: "checkout-api-0",
    status: "open",
    createdAt: "2026-07-12T09:58:00.000Z",
  }],
  dataQualityWarnings: [],
};

export const NODES: HomeNodeCollection = {
  clusterId: "cluster-1",
  completeness: "unknown",
  nodes: [
    {
      id: "node:cluster-1/worker-a",
      identityStability: "ephemeral",
      name: "worker-a",
      ready: true,
      health: "healthy",
      podsRunning: 9,
      podsCapacity: 110,
      cpuPercent: 37.5,
      memoryPercent: 54,
      restartCount: 0,
      conditions: [],
    },
    {
      id: "node:cluster-1/worker-b",
      identityStability: "ephemeral",
      name: "worker-b",
      ready: false,
      health: "warning",
      podsRunning: 8,
      podsCapacity: 110,
      cpuPercent: null,
      memoryPercent: null,
      restartCount: 3,
      conditions: ["MemoryPressure"],
    },
  ],
};

export const INSIGHTS: HomeInsights = {
  clusterId: "cluster-1",
  customResources: {
    coverage: {
      availability: "available",
      observedAt: "2026-07-12T10:00:00.000Z",
      reasonCodes: [],
    },
    items: [{
      apiGroup: "argoproj.io",
      version: "v1alpha1",
      kind: "Application",
      count: 7,
    }],
    totalKinds: 1,
    totalResources: 7,
    hasMore: false,
  },
  helm: {
    coverage: {
      availability: "available",
      observedAt: "2026-07-12T10:00:00.000Z",
      reasonCodes: [],
    },
    releaseCount: 2,
    statusCounts: { deployed: 2 },
  },
  refreshAfterSeconds: 30,
};

export const PODS: HomePodCollection = {
  clusterId: "cluster-1",
  nodeName: "worker-b",
  completeness: "unknown",
  pods: [{
    id: "pod:cluster-1/worker-b/shop/checkout-api-0",
    identityStability: "ephemeral",
    name: "checkout-api-0",
    namespace: "shop",
    phase: "Running",
    health: "warning",
    readiness: { ready: 1, total: 2 },
    restartCount: 3,
    owner: { kind: "StatefulSet", name: "checkout-api" },
    cpuMillicores: 245.5,
    memoryMebibytes: 382,
    incidentCorrelationId: "correlation-1",
  }],
};

export function renderHome(
  port: HomePort,
  initialEntries = ["/?clusters=cluster-1"],
  reportUnauthorized = vi.fn(),
  locale: SupportedLocale | null = "ko",
) {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <AuthSessionGateProvider reportUnauthorized={reportUnauthorized}>
        <I18nProvider
          navigatorLanguage={locale === "ko" ? "ko-KR" : locale === "en" ? "en-US" : null}
          storage={null}
        >
          <UnifiedFilterProvider>
            <ClusterScopeProvider authorityKey="test-workspace:test-user" port={port}>
              <HomePage port={port} />
              <LocationProbe />
            </ClusterScopeProvider>
          </UnifiedFilterProvider>
        </I18nProvider>
      </AuthSessionGateProvider>
    </MemoryRouter>,
  );
}

export function homePort(overrides: Partial<HomePort> = {}): HomePort {
  return {
    listClusterChoices: vi.fn().mockResolvedValue(CLUSTERS),
    loadClusterOverview: vi.fn().mockResolvedValue(OVERVIEW),
    loadInsights: vi.fn().mockResolvedValue(INSIGHTS),
    loadNodes: vi.fn().mockResolvedValue(NODES),
    loadNodePods: vi.fn().mockResolvedValue(PODS),
    ...overrides,
  };
}

export function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => { resolve = next; });
  return { promise, resolve };
}

function LocationProbe() {
  const location = useLocation();
  return (
    <output data-testid="home-location">
      {location.pathname}{location.search}
    </output>
  );
}

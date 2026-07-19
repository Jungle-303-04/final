import { render } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { vi } from "vitest";
import { AuthSessionGateProvider } from "../../features/auth/AuthSessionGate";
import { ProductSessionProvider } from "../../features/auth/ProductSessionContext";
import { ClusterScopeProvider } from "../../features/cluster-scope/ClusterScopeProvider";
import { UnifiedFilterProvider } from "../../features/filters/UnifiedFilterProvider";
import type {
  HomeClusterOverview,
  HomeInsights,
  HomeNodeCollection,
  HomePort,
} from "../../features/home/homeContract";
import { I18nProvider } from "../../shared/i18n/I18nProvider";
import type { SupportedLocale } from "../../shared/i18n/types";
import { homeBoardPorts } from "./HomeBoard.testSupport";
import { CLUSTERS, PODS } from "./HomePage.testFixtures";
import { HomePage } from "./HomePage";
export { homeBoardPorts, CLUSTERS, PODS };
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
      kubernetesVersion: "v1.30.7",
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
      kubernetesVersion: "v1.30.7",
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
  topology: {
    coverage: {
      availability: "available",
      observedAt: "2026-07-12T10:00:00.000Z",
      reasonCodes: [],
    },
    nodeCount: 12,
    edgeCount: 9,
    omittedNodeCount: 0,
    omittedEdgeCount: 0,
    relationCompleteness: "exact",
  },
  explore: {
    traffic: {
      coverage: {
        availability: "unavailable",
        observedAt: null,
        reasonCodes: ["traffic_observation_not_integrated"],
      },
    },
    cost: {
      coverage: {
        availability: "unavailable",
        observedAt: null,
        reasonCodes: ["cost_observation_not_integrated"],
      },
    },
  },
  posture: {
    networkPolicy: {
      coverage: {
        availability: "unavailable",
        observedAt: null,
        reasonCodes: ["network_policy_coverage_not_reported"],
      },
      totalPolicies: null,
      coveredWorkloads: null,
      totalWorkloads: null,
    },
    gitops: {
      coverage: {
        availability: "available",
        observedAt: "2026-07-12T10:00:00.000Z",
        reasonCodes: [],
      },
      controllerCount: 2,
      providerCounts: { argo: 1, flux: 1 },
      healthCounts: { healthy: 1, degraded: 1 },
    },
    audit: {
      coverage: {
        availability: "available",
        observedAt: "2026-07-12T10:00:00.000Z",
        reasonCodes: [],
      },
      totalCheckCount: 6,
      totalFindingCount: 3,
      severityCounts: { warning: 2, danger: 1 },
    },
  },
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
  certificateExpiry: {
    coverage: {
      availability: "available",
      observedAt: "2026-07-12T10:00:00.000Z",
      reasonCodes: [],
    },
    items: [{
      secret: {
        apiGroup: "",
        version: "v1",
        kind: "Secret",
        namespace: "shop",
        name: "api-tls",
        uid: "secret-api-tls",
      },
      sourceCertificate: {
        apiGroup: "cert-manager.io",
        version: "v1",
        kind: "Certificate",
        namespace: "shop",
        name: "api-certificate",
        uid: "certificate-api",
      },
      notAfter: "2026-07-20T10:00:00.000Z",
      status: "expiring",
      secondsRemaining: 345_600,
      observedAt: "2026-07-12T10:00:00.000Z",
    }],
    tlsSecretCount: 1,
    observedExpiryCount: 1,
    expiringCount: 1,
    expiredCount: 0,
    earliestExpiry: "2026-07-20T10:00:00.000Z",
    warningBeforeSeconds: 2_592_000,
    hasMore: false,
  },
  refreshAfterSeconds: 30,
};
export function renderHome(
  port: HomePort,
  initialEntries = ["/?clusters=cluster-1"],
  reportUnauthorized = vi.fn(),
  locale: SupportedLocale | null = "ko",
  board = homeBoardPorts(),
) {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <AuthSessionGateProvider reportUnauthorized={reportUnauthorized}>
        <ProductSessionProvider session={TEST_SESSION}>
          <I18nProvider
            navigatorLanguage={locale === "ko" ? "ko-KR" : locale === "en" ? "en-US" : null}
            storage={null}
          >
            <UnifiedFilterProvider>
              <ClusterScopeProvider authorityKey="test-workspace:test-user" port={port}>
                <HomePage boardPorts={board} port={port} />
                <LocationProbe />
              </ClusterScopeProvider>
            </UnifiedFilterProvider>
          </I18nProvider>
        </ProductSessionProvider>
      </AuthSessionGateProvider>
    </MemoryRouter>,
  );
}
const TEST_SESSION = {
  authEnabled: true as const,
  authMode: "password" as const,
  groups: [],
  logout: {
    action: "end_session" as const,
    supported: true,
    reauthenticationExpected: false,
  },
  roles: [],
  userId: "test-user",
  workspaceId: "test-workspace",
};
export function homePort(overrides: Partial<HomePort> = {}): HomePort {
  return {
    loadDashboardRefreshPolicy: vi.fn().mockResolvedValue({
      staleAfterSeconds: 15,
      refreshAfterSeconds: 30,
      keepLastSuccess: true,
      pauseWhenHidden: true,
      eventInvalidation: true,
      retryAfterSeconds: null,
      retryLimit: null,
      postMutationRefreshAfterSeconds: null,
    }),
    listClusterChoices: vi.fn().mockResolvedValue(CLUSTERS),
    loadClusterOverview: vi.fn().mockImplementation(async (clusterId: string) =>
      clusterId === OVERVIEW.clusterId
        ? OVERVIEW
        : {
            ...OVERVIEW,
            clusterId,
            name: clusterId,
            usage: {
              ...OVERVIEW.usage!,
              nodesReady: 1,
              nodesTotal: 1,
              podsRunning: 4,
              podsTotal: 4,
            },
          }
    ),
    loadInsights: vi.fn().mockResolvedValue(INSIGHTS),
    loadNodes: vi.fn().mockResolvedValue(NODES),
    loadNodePods: vi.fn().mockResolvedValue(PODS),
    subscribeDashboardInvalidations: () => ({
      async *[Symbol.asyncIterator]() {
        yield* [];
      },
    }),
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

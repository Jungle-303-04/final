import { render } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { vi } from "vitest";

import { AuthSessionGateProvider } from "../../features/auth/AuthSessionGate";
import { ClusterScopeProvider } from "../../features/cluster-scope/ClusterScopeProvider";
import type { UnifiedFilterState } from "../../features/filters/filterContract";
import { UnifiedFilterProvider } from "../../features/filters/UnifiedFilterProvider";
import type { HomePort } from "../../features/home/homeContract";
import type { PhysicalTopologyPort } from "../../features/resources/physicalTopologyContract";
import { EMPTY_PHYSICAL_TOPOLOGY_REALTIME_PORT, type PhysicalTopologyRealtimePort } from "../../features/resources/physicalTopologyRealtimeContract";
import type { RelationTopologyPort } from "../../features/resources/relationTopologyContract";
import type { ChangeTimelinePort } from "../../features/resources/changeTimelineContract";
import type {
  ResourceMetricsHistoryPort,
  ResourcesRefreshPolicyKey,
} from "../../features/resources/resourceMetricsHistoryContract";
import type { ResourceActionsPort, ResourceCapabilitiesPort } from "../../features/resources/resourceCapabilitiesContract";
import type { ResourceManifestPort } from "../../features/resources/resourceManifestContract";
import type { ResourcesPort } from "../../features/resources/resourcesContract";
import type { ResourcesFilterPort, ResourcesFilterResourcePage } from "../../features/resources/resourcesFilterContract";
import { I18nProvider, type SupportedLocale } from "../../shared/i18n";
import { ResourcesPage } from "./ResourcesPage";
import { CATALOG, CLUSTERS, POD_DETAIL, POD_LIST } from "./ResourcesPage.testFixtures";
import { PHYSICAL_TOPOLOGY } from "./ResourcesPage.physicalTestSupport";
import { resourcesActionsPort, resourcesCapabilitiesPort } from "./ResourcesPage.testRuntime";
import { BottomDockProvider } from "../../features/bottom-dock/BottomDockProvider";
import { EMPTY_LOG_STREAM_PORT, type LogStreamPort } from "../../features/log-stream/logStreamContract";
import { ClusterScopeProbe, LocationProbe } from "./ResourcesPage.testProbes.testSupport";
import { resourcesChangeTimelinePort } from "./ResourcesPage.timelineTestSupport";
import type {
  BrowserRefreshPolicy,
  BrowserRefreshPolicyRegistry,
} from "../../shared/data/browserRefreshPolicyRegistry";

export {
  CATALOG,
  CLUSTERS,
  DISCOVERED_CATALOG,
  NODE_LIST,
  POD_DETAIL,
  POD_LIST,
} from "./ResourcesPage.testFixtures";
export { PHYSICAL_TOPOLOGY } from "./ResourcesPage.physicalTestSupport";
export { resourcesActionsPort, resourcesCapabilitiesPort } from "./ResourcesPage.testRuntime";
export { resourcesChangeTimelinePort } from "./ResourcesPage.timelineTestSupport";

type ClusterPort = Pick<HomePort, "listClusterChoices">;

export function renderResources(
  port: ResourcesPort,
  initialEntry = "/resources?clusters=cluster-1&resources.types=pod",
  clusterPort: ClusterPort = resourcesClusterPort(),
  reportUnauthorized = vi.fn(),
  locale: SupportedLocale = "ko",
  filterPort: ResourcesFilterPort = resourcesFilterPort(),
  physicalTopologyPort: PhysicalTopologyPort = resourcesPhysicalTopologyPort(),
  resourceMetricsHistoryPort: ResourceMetricsHistoryPort = resourcesMetricHistoryPort(),
  resourceCapabilitiesPort: ResourceCapabilitiesPort = resourcesCapabilitiesPort(),
  resourceActionsPort: ResourceActionsPort = resourcesActionsPort(),
  logStreamPort: LogStreamPort = EMPTY_LOG_STREAM_PORT,
  relationTopologyPort: RelationTopologyPort = resourcesRelationTopologyPort(),
  changeTimelinePort: ChangeTimelinePort = resourcesChangeTimelinePort(),
  physicalTopologyRealtimePort: PhysicalTopologyRealtimePort = EMPTY_PHYSICAL_TOPOLOGY_REALTIME_PORT,
  nodePodsPort: Pick<HomePort, "loadNodePods"> = resourcesNodePodsPort(),
  refreshPolicies: BrowserRefreshPolicyRegistry<ResourcesRefreshPolicyKey> = resourcesRefreshPolicies(),
  resourceManifestPort?: ResourceManifestPort,
) {
  const router = createMemoryRouter(
    [
      {
        path: "/resources/*",
        element: (
          <I18nProvider
            navigatorLanguage={locale === "ko" ? "ko-KR" : "en-US"}
            storage={null}
          >
            <AuthSessionGateProvider reportUnauthorized={reportUnauthorized}>
              <UnifiedFilterProvider>
                <ClusterScopeProvider
                  authorityKey="test-workspace:test-user"
                  port={clusterPort}
                >
                  <BottomDockProvider port={logStreamPort}>
                    <ResourcesPage
                      filterPort={filterPort}
                      physicalTopologyPort={physicalTopologyPort}
                      physicalTopologyRealtimePort={physicalTopologyRealtimePort}
                      nodePodsPort={nodePodsPort}
                      relationTopologyPort={relationTopologyPort}
                      changeTimelinePort={changeTimelinePort}
                      resourceMetricsHistoryPort={resourceMetricsHistoryPort}
                      refreshPolicies={refreshPolicies}
                      resourceCapabilitiesPort={resourceCapabilitiesPort}
                      resourceActionsPort={resourceActionsPort}
                      resourceManifestPort={resourceManifestPort}
                      port={port}
                    />
                  </BottomDockProvider>
                  <LocationProbe />
                  <ClusterScopeProbe />
                </ClusterScopeProvider>
              </UnifiedFilterProvider>
            </AuthSessionGateProvider>
          </I18nProvider>
        ),
      },
    ],
    { initialEntries: [initialEntry] },
  );

  return {
    ...render(<RouterProvider router={router} />),
    clusterPort,
    reportUnauthorized,
    router,
  };
}

export function resourcesRefreshPolicies(
  overrides: Partial<Record<ResourcesRefreshPolicyKey, BrowserRefreshPolicy>> = {},
): BrowserRefreshPolicyRegistry<ResourcesRefreshPolicyKey> {
  const base = (refreshAfterSeconds: number): BrowserRefreshPolicy => ({
    staleAfterSeconds: null,
    refreshAfterSeconds,
    keepLastSuccess: true,
    pauseWhenHidden: true,
    eventInvalidation: false,
    retryAfterSeconds: null,
    retryLimit: null,
    postMutationRefreshAfterSeconds: null,
  });
  const policies: Record<ResourcesRefreshPolicyKey, BrowserRefreshPolicy> = {
    changes: base(15),
    resource_list: { ...base(60), eventInvalidation: true },
    resource_list_slow: { ...base(120), eventInvalidation: true },
    metrics_kubernetes: { ...base(30), retryAfterSeconds: 5, retryLimit: 2 },
    metrics_prometheus: base(60),
    metrics_pvc: base(120),
    metrics_rightsizing: base(600),
    ...overrides,
  };
  return {
    getPolicy: vi.fn((key: ResourcesRefreshPolicyKey) => Promise.resolve(policies[key])),
  };
}

export function resourcesClusterPort(
  overrides: Partial<ClusterPort> = {},
): ClusterPort {
  return {
    listClusterChoices: vi.fn().mockResolvedValue(CLUSTERS),
    ...overrides,
  };
}

export function resourcesNodePodsPort(
  overrides: Partial<Pick<HomePort, "loadNodePods">> = {},
): Pick<HomePort, "loadNodePods"> {
  return {
    loadNodePods: vi.fn().mockResolvedValue({
      clusterId: "cluster-1",
      completeness: "unknown",
      nodeName: "worker-a",
      pods: [{
        id: "pod:cluster-1/worker-a/shop/checkout-api-0",
        identityStability: "ephemeral",
        name: "checkout-api-0",
        namespace: "shop",
        phase: "Running",
        health: "healthy",
        readiness: { ready: 1, total: 1 },
        restartCount: 0,
        owner: null,
        cpuMillicores: 32,
        memoryMebibytes: 64,
        incidentCorrelationId: null,
      }],
    }),
    ...overrides,
  };
}

export function resourcesPort(
  overrides: Partial<ResourcesPort> = {},
): ResourcesPort {
  return {
    loadCatalog: vi.fn().mockResolvedValue(CATALOG),
    listResources: vi.fn().mockImplementation((clusterId, query) =>
      Promise.resolve({
        ...POD_LIST,
        clusterId,
        resourceType: query.resourceType,
        namespace: query.namespace ?? null,
      }),
    ),
    loadResourceDetail: vi.fn().mockResolvedValue(POD_DETAIL),
    ...overrides,
  };
}

export function resourcesFilterPort(
  overrides: Partial<ResourcesFilterPort> = {},
): ResourcesFilterPort {
  return {
    listFacetPage: vi.fn().mockResolvedValue({
      axis: "clusters",
      items: [],
      selectedResolutions: [],
      nextCursor: null,
      hasMore: false,
      snapshot: filterSnapshot(),
    }),
    listResourcePage: vi
      .fn()
      .mockImplementation((state: UnifiedFilterState) => {
        const query = state.resources.query.trim().toLocaleLowerCase();
        const namespaces = new Set(
          state.common.namespaces.map((item) => item.namespace),
        );
        const types = new Set(state.resources.types);
        const items = POD_LIST.items
          .filter(
            (item) =>
              (query.length === 0 ||
                [item.name, item.kind, item.namespace ?? ""].some((value) =>
                  value.toLocaleLowerCase().includes(query),
                )) &&
              (namespaces.size === 0 ||
                (item.namespace !== null && namespaces.has(item.namespace))) &&
              (types.size === 0 || types.has(item.resourceType)),
          )
          .map((resource) => ({
            resource,
            cluster: {
              clusterId: resource.clusterId,
              name: resource.clusterId,
              provider: "eks",
            },
            applicationIds: [],
            applicationBindingCompleteness: "exact" as const,
          }));
        return Promise.resolve(
          resourcesFilterPage({
            ...POD_LIST,
            items: items.map(({ resource }) => resource),
            returned: items.length,
          }),
        );
      }),
    listLabelFacetPage: vi.fn().mockResolvedValue({
      surface: "resources",
      items: [],
      selectedResolutions: [],
      nextCursor: null,
      hasMore: false,
      counts: {
        filteredCount: 0,
        unfilteredCount: 0,
        filteredCountCompleteness: "exact",
        unfilteredCountCompleteness: "exact",
      },
      snapshot: filterSnapshot(),
    }),
    ...overrides,
  };
}

export function resourcesPhysicalTopologyPort(
  overrides: Partial<PhysicalTopologyPort> = {},
): PhysicalTopologyPort {
  return {
    loadPhysicalTopology: vi.fn().mockResolvedValue(PHYSICAL_TOPOLOGY),
    ...overrides,
  };
}

export function resourcesRelationTopologyPort(
  overrides: Partial<RelationTopologyPort> = {},
): RelationTopologyPort {
  return {
    loadRelationTopology: vi.fn().mockResolvedValue({
      availability: "available",
      clusterId: "cluster-1",
      clusterProjectionRevision: 42,
      graphRevision: "graph-test-support",
      refreshAfterSeconds: 60,
      nodes: [
        relationNode("deployment:shop/checkout-api", "workload", "Deployment", "checkout-api", "Ready"),
        relationNode("pod:shop/checkout-api-0", "pod", "Pod", "checkout-api-0", "CrashLoopBackOff"),
        relationNode("service:shop/checkout-api", "service", "Service", "checkout-api", "Ready"),
      ],
      edges: [
        { from: "deployment:shop/checkout-api", to: "pod:shop/checkout-api-0", type: "owns" },
        { from: "service:shop/checkout-api", to: "pod:shop/checkout-api-0", type: "selects" },
      ],
      counts: {
        filteredCount: 3,
        unfilteredCount: 3,
        filteredCountCompleteness: "exact",
        unfilteredCountCompleteness: "exact",
      },
      relationCompleteness: "exact",
      partialReasonCodes: [],
      truncated: false,
      omittedNodeCount: 0,
      omittedEdgeCount: 0,
      snapshot: {
        snapshotRevision: 42,
        authorizationRevision: "auth-test",
        filterFingerprint: "filter-test",
        observedAt: "2026-07-14T05:00:00Z",
        stale: false,
        partialReasonCodes: [],
      },
    }),
    ...overrides,
  };
}

function relationNode(
  id: string,
  resourceType: string,
  kind: string,
  name: string,
  status: string,
) {
  return {
    id,
    identity: {
      resourceType,
      kind,
      namespace: "shop",
      name,
    },
    kind,
    name,
    status,
  };
}

export function resourcesMetricHistoryPort(
  overrides: Partial<ResourceMetricsHistoryPort> = {},
): ResourceMetricsHistoryPort {
  return {
    loadResourceMetricsHistory: vi.fn().mockResolvedValue({
      refreshPolicyKey: "metrics_kubernetes",
      series: [],
      completeness: "unavailable",
      partialReasonCodes: ["metrics_history_unavailable"],
      snapshot: {
        snapshotRevision: 42,
        authorizationRevision: "auth-1",
        filterFingerprint: "filter-1",
        observedAt: "2026-07-12T10:00:00.000Z",
        stale: false,
        partialReasonCodes: [],
      },
    }),
    ...overrides,
  };
}

export function resourcesFilterPage(
  list = POD_LIST,
): ResourcesFilterResourcePage {
  return {
    items: list.items.map((resource) => ({
      resource,
      cluster: {
        clusterId: resource.clusterId,
        name: resource.clusterId,
        provider: "eks",
      },
      applicationIds: [],
      applicationBindingCompleteness: "exact",
    })),
    nextCursor: null,
    hasMore: list.limitReached,
    counts: {
      filteredCount: list.returned,
      unfilteredCount: POD_LIST.items.length,
      filteredCountCompleteness: "exact",
      unfilteredCountCompleteness: "exact",
    },
    snapshot: filterSnapshot(),
    excludedCount: list.excludedCount ?? 0,
    dataQualityWarnings: [],
  };
}

function filterSnapshot() {
  return {
    snapshotRevision: 42,
    authorizationRevision: "auth-1",
    filterFingerprint: "filter-1",
    observedAt: "2026-07-12T10:00:00.000Z",
    stale: false,
    partialReasonCodes: [],
  };
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

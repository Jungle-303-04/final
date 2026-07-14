import { render } from "@testing-library/react";
import { createMemoryRouter, RouterProvider, useLocation } from "react-router-dom";
import { vi } from "vitest";

import { AuthSessionGateProvider } from "../../features/auth/AuthSessionGate";
import {
  ClusterScopeProvider,
  useClusterScope,
} from "../../features/cluster-scope/ClusterScopeProvider";
import type { UnifiedFilterState } from "../../features/filters/filterContract";
import { UnifiedFilterProvider } from "../../features/filters/UnifiedFilterProvider";
import type { HomePort } from "../../features/home/homeContract";
import type { PhysicalTopologyPort } from "../../features/resources/physicalTopologyContract";
import type { ResourceMetricsHistoryPort } from "../../features/resources/resourceMetricsHistoryContract";
import type { ResourcesPort } from "../../features/resources/resourcesContract";
import type {
  ResourcesFilterPort,
  ResourcesFilterResourcePage,
} from "../../features/resources/resourcesFilterContract";
import { I18nProvider, type SupportedLocale } from "../../shared/i18n";
import { ResourcesPage } from "./ResourcesPage";
import {
  CATALOG,
  CLUSTERS,
  POD_DETAIL,
  POD_LIST,
} from "./ResourcesPage.testFixtures";
import { PHYSICAL_TOPOLOGY } from "./ResourcesPage.physicalTestSupport";

export {
  CATALOG,
  CLUSTERS,
  DISCOVERED_CATALOG,
  NODE_LIST,
  POD_DETAIL,
  POD_LIST,
} from "./ResourcesPage.testFixtures";
export { PHYSICAL_TOPOLOGY } from "./ResourcesPage.physicalTestSupport";

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
                  <ResourcesPage
                    filterPort={filterPort}
                    physicalTopologyPort={physicalTopologyPort}
                    resourceMetricsHistoryPort={resourceMetricsHistoryPort}
                    port={port}
                  />
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

export function resourcesClusterPort(
  overrides: Partial<ClusterPort> = {},
): ClusterPort {
  return {
    listClusterChoices: vi.fn().mockResolvedValue(CLUSTERS),
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

export function resourcesMetricHistoryPort(
  overrides: Partial<ResourceMetricsHistoryPort> = {},
): ResourceMetricsHistoryPort {
  return {
    loadResourceMetricsHistory: vi.fn().mockResolvedValue({
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
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    value,
  });
}

function LocationProbe() {
  const location = useLocation();
  return (
    <output data-testid="resources-location">
      {location.pathname}
      {location.search}
    </output>
  );
}

function ClusterScopeProbe() {
  const scope = useClusterScope();
  return (
    <output data-testid="resources-cluster-scope">
      {scope.collection.phase}:{scope.requestedClusterId ?? "-"}
    </output>
  );
}

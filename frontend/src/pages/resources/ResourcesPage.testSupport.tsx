import { render } from "@testing-library/react";
import { createMemoryRouter, RouterProvider, useLocation } from "react-router-dom";
import { vi } from "vitest";
import { AuthSessionGateProvider } from "../../features/auth/AuthSessionGate";
import {
  ClusterScopeProvider,
  useClusterScope,
} from "../../features/cluster-scope/ClusterScopeProvider";
import { UnifiedFilterProvider } from "../../features/filters/UnifiedFilterProvider";
import type { HomePort } from "../../features/home/homeContract";
import type { ResourcesPort } from "../../features/resources/resourcesContract";
import { I18nProvider, type SupportedLocale } from "../../shared/i18n";
import { ResourcesPage } from "./ResourcesPage";
import {
  CATALOG,
  CLUSTERS,
  INFRA_MAP,
  POD_DETAIL,
  POD_LIST,
} from "./ResourcesPage.testFixtures";

export {
  CATALOG,
  CLUSTERS,
  DISCOVERED_CATALOG,
  INFRA_MAP,
  NODE_LIST,
  POD_DETAIL,
  POD_LIST,
} from "./ResourcesPage.testFixtures";

type ClusterPort = Pick<HomePort, "listClusterChoices">;

export function renderResources(
  port: ResourcesPort,
  initialEntry = "/resources?clusters=cluster-1&resources.types=pod",
  clusterPort: ClusterPort = resourcesClusterPort(),
  reportUnauthorized = vi.fn(),
  locale: SupportedLocale = "ko",
) {
  const router = createMemoryRouter([{
    path: "/resources/*",
    element: (
      <I18nProvider navigatorLanguage={locale === "ko" ? "ko-KR" : "en-US"} storage={null}>
        <AuthSessionGateProvider reportUnauthorized={reportUnauthorized}>
          <UnifiedFilterProvider>
            <ClusterScopeProvider authorityKey="test-workspace:test-user" port={clusterPort}>
              <ResourcesPage port={port} />
              <LocationProbe />
              <ClusterScopeProbe />
            </ClusterScopeProvider>
          </UnifiedFilterProvider>
        </AuthSessionGateProvider>
      </I18nProvider>
    ),
  }], { initialEntries: [initialEntry] });

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

export function resourcesPort(overrides: Partial<ResourcesPort> = {}): ResourcesPort {
  return {
    loadCatalog: vi.fn().mockResolvedValue(CATALOG),
    loadInfraMap: vi.fn().mockImplementation((clusterId) => Promise.resolve({
      ...INFRA_MAP,
      clusterId,
    })),
    listResources: vi.fn().mockImplementation((clusterId, query) => Promise.resolve({
      ...POD_LIST,
      clusterId,
      resourceType: query.resourceType,
      namespace: query.namespace ?? null,
    })),
    loadResourceDetail: vi.fn().mockResolvedValue(POD_DETAIL),
    ...overrides,
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

function LocationProbe() {
  const location = useLocation();
  return (
    <output data-testid="resources-location">
      {location.pathname}{location.search}
    </output>
  );
}

function ClusterScopeProbe() {
  const scope = useClusterScope();
  return (
    <output data-testid="resources-cluster-scope">{scope.collection.phase}:{
      scope.requestedClusterId ?? "-"
    }</output>
  );
}

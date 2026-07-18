import { Navigate, Route, Routes } from "react-router-dom";
import { ProductStateScreen } from "../shared/ui/ProductStateScreen";
import { useI18n } from "../shared/i18n";
import { AuthSessionControl } from "../features/auth/AuthSessionControl";
import type { AuthenticatedAuthState } from "../features/auth/authContract";
import { ClusterScopeProvider } from "../features/cluster-scope/ClusterScopeProvider";
import { UnifiedFilterProvider, useUnifiedFilter } from "../features/filters/UnifiedFilterProvider";
import { OperationStatusStoreProvider } from "../features/operations/OperationStatusStore";
import { ProductShell } from "./ProductShell";
import { DesktopRuntimeSync } from "../desktop/DesktopRuntimeSync";
import type { ProductComposition } from "./productComposition";
import { RouteSurface } from "./RouteSurface";
import { WorkloadDetailRoute } from "../pages/workload-detail/WorkloadDetailRoute";
import { CompareRoute } from "../pages/compare/CompareRoute";
import { DiagnoseSessionProvider } from "../features/diagnose/DiagnoseSessionContext";
import {
  landingProductRouteForReleasedSurfaces,
  PRODUCT_ROUTE_CATALOG,
  productRoutePaths,
  routeDefinitionForSurface,
  type ProductRouteDefinition,
} from "./productRoutes";
import { navLabelKeys } from "./ProductShellNavigation";
import { UiPreferencesSync } from "../features/preferences/UiPreferencesSync";

export function ProductRouter({
  auth,
  composition,
}: {
  auth: AuthenticatedAuthState;
  composition: ProductComposition;
}) {
  if (composition.surfaces.length === 0) {
    return (
      <ProductStateScreen
        action={<AuthSessionControl auth={auth} />}
        kind="release"
      />
    );
  }

  const landingRoute = landingProductRouteForReleasedSurfaces(
    composition.releasedSurfaceIds,
  );

  return (
    <OperationStatusStoreProvider store={composition.operationStatusStore}>
      <DiagnoseSessionProvider port={composition.diagnose}>
        <UnifiedFilterProvider>
          <ClusterScopeProvider
            authorityKey={`${auth.session.workspaceId}:${auth.session.userId}`}
            port={composition.clusterScope}
          >
            <UiPreferencesSync port={composition.shellState} />
            <DesktopRuntimeSync />
            <Routes>
          <Route element={(
            <ProductShell
              auth={auth}
              globalFilterPort={composition.globalFilter}
              aiAssistantPort={composition.aiAssistant}
              logStreamPort={composition.logStream}
              alertEventsPort={composition.alertEvents}
              shellStatePort={composition.shellState}
              runtimeStatusPort={composition.runtimeStatus}
              portForwardSessions={composition.portForwardSessions}
              releasedSurfaceIds={composition.releasedSurfaceIds}
            />
          )}>
            <Route index element={<ProductFallbackRedirect path={landingRoute.path} />} />
            {composition.surfaces.flatMap((registration) => {
              const { id } = registration;
              const routeDefinition = routeDefinitionForSurface(id);
              const routeElement = routeDefinition.redirectTo === null
                ? <RouteSurface key={id} registration={registration} />
                : <ProductLegacyRedirect routeDefinition={routeDefinition} />;
              return [
                <Route
                  element={routeElement}
                  key={id}
                  path={routePathForDefinition(routeDefinition, routeDefinition.path)}
                />,
                ...routeDefinition.aliases.map((routePath) => (
                  <Route
                    element={<ProductFallbackRedirect path={routeDefinition.path} />}
                    key={`alias:${id}:${routePath}`}
                    path={routePathForDefinition(routeDefinition, routePath)}
                  />
                )),
              ];
            })}
            {PRODUCT_ROUTE_CATALOG
              .filter((routeDefinition) => !composition.releasedSurfaceIds.has(routeDefinition.id))
              .flatMap((routeDefinition) => productRoutePaths(routeDefinition).map((routePath) => (
                <Route
                  element={<ProductUnavailableRoute routeDefinition={routeDefinition} />}
                  key={`unavailable:${routeDefinition.id}:${routePath}`}
                  path={routePathForDefinition(routeDefinition, routePath)}
                />
              )))}
            <Route
              element={(
                <WorkloadDetailRoute
                  port={composition.workloadDetail}
                  rcaContextPort={composition.rcaContext}
                />
              )}
              path="/workload/:kind/:namespace/:name"
            />
            <Route element={<CompareRoute port={composition.compare} />} path="/compare" />
            <Route path="*" element={<ProductFallbackRedirect path={landingRoute.path} />} />
          </Route>
            </Routes>
          </ClusterScopeProvider>
        </UnifiedFilterProvider>
      </DiagnoseSessionProvider>
    </OperationStatusStoreProvider>
  );
}

function ProductUnavailableRoute({ routeDefinition }: { routeDefinition: ProductRouteDefinition }) {
  const { t } = useI18n();
  const label = t(navLabelKeys[routeDefinition.id]);
  return (
    <section
      aria-labelledby="unavailable-product-route-title"
      className="grid min-h-full place-items-center bg-background p-6 text-foreground"
    >
      <div className="w-full max-w-lg rounded-xl border bg-card p-6 shadow-sm">
        <p className="text-sm font-medium text-muted-foreground">{t("shell.command.unavailable")}</p>
        <h2 className="mt-2 text-2xl font-semibold tracking-tight" id="unavailable-product-route-title">
          {t("shell.route.unavailable.title", { route: label })}
        </h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          {t("shell.route.unavailable.description", { route: label })}
        </p>
      </div>
    </section>
  );
}

function routePathForDefinition(
  routeDefinition: ProductRouteDefinition,
  path: `/${string}`,
): string {
  return routeDefinition.match === "prefix" ? `${path}/*` : path;
}

function ProductFallbackRedirect({ path }: { path: `/${string}` }) {
  const filter = useUnifiedFilter();
  return <Navigate replace to={filter.navigationHref(path)} />;
}

function ProductLegacyRedirect({
  routeDefinition,
}: {
  routeDefinition: ProductRouteDefinition;
}) {
  const filter = useUnifiedFilter();
  const target = routeDefinition.redirectTo;
  if (target === null) return <ProductFallbackRedirect path="/home" />;
  const targetRoute = routeDefinitionForSurface(target);
  return (
    <Navigate
      replace
      to={filter.navigationHref(targetRoute.path, {
        ...filter.detail,
        surfaceTab: routeDefinition.redirectSection ?? undefined,
      })}
    />
  );
}

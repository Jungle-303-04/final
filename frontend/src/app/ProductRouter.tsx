import { Navigate, Route, Routes } from "react-router-dom";
import { ProductStateScreen } from "../shared/ui/ProductStateScreen";
import { AuthSessionControl } from "../features/auth/AuthSessionControl";
import type { AuthenticatedAuthState } from "../features/auth/authContract";
import { ClusterScopeProvider } from "../features/cluster-scope/ClusterScopeProvider";
import { UnifiedFilterProvider, useUnifiedFilter } from "../features/filters/UnifiedFilterProvider";
import { ProductShell } from "./ProductShell";
import type { ProductComposition } from "./productComposition";
import { routeDefinitionForSurface } from "./productRoutes";

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

  const fallbackRoute = routeDefinitionForSurface(composition.surfaces[0].id);

  return (
    <UnifiedFilterProvider>
      <ClusterScopeProvider
        authorityKey={`${auth.session.workspaceId}:${auth.session.userId}`}
        port={composition.clusterScope}
      >
        <Routes>
          <Route element={(
            <ProductShell
              auth={auth}
              globalFilterPort={composition.globalFilter}
              aiAssistantPort={composition.aiAssistant}
              logStreamPort={composition.logStream}
              releasedSurfaceIds={composition.releasedSurfaceIds}
            />
          )}>
            {composition.surfaces.map(({ id, Component }) => {
              const routeDefinition = routeDefinitionForSurface(id);
              const routePath = routeDefinition.match === "prefix"
                ? `${routeDefinition.path}/*`
                : routeDefinition.path;
              return <Route key={id} path={routePath} element={<Component />} />;
            })}
            {composition.releasedSurfaceIds.has("gitops") ? (
              <Route path="/workflows/*" element={<ProductFallbackRedirect path="/gitops" />} />
            ) : null}
            <Route path="*" element={<ProductFallbackRedirect path={fallbackRoute.path} />} />
          </Route>
        </Routes>
      </ClusterScopeProvider>
    </UnifiedFilterProvider>
  );
}

function ProductFallbackRedirect({ path }: { path: `/${string}` }) {
  const filter = useUnifiedFilter();
  return <Navigate replace to={filter.navigationHref(path)} />;
}

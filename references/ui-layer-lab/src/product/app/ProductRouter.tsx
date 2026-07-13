import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { ProductStateScreen } from "../shared/ui/ProductStateScreen";
import { AuthSessionControl } from "../features/auth/AuthSessionControl";
import type { AuthenticatedAuthState } from "../features/auth/authContract";
import { ClusterScopeProvider } from "../features/cluster-scope/ClusterScopeProvider";
import { productNavigationHref } from "../features/cluster-scope/clusterScopeUrl";
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
    <ClusterScopeProvider
      authorityKey={`${auth.session.workspaceId}:${auth.session.userId}`}
      port={composition.clusterScope}
    >
      <Routes>
        <Route element={(
          <ProductShell auth={auth} releasedSurfaceIds={composition.releasedSurfaceIds} />
        )}>
          {composition.surfaces.map(({ id, Component }) => {
            const routeDefinition = routeDefinitionForSurface(id);
            const routePath = routeDefinition.match === "prefix"
              ? `${routeDefinition.path}/*`
              : routeDefinition.path;
            return <Route key={id} path={routePath} element={<Component />} />;
          })}
          <Route path="*" element={<ProductFallbackRedirect path={fallbackRoute.path} />} />
        </Route>
      </Routes>
    </ClusterScopeProvider>
  );
}

function ProductFallbackRedirect({ path }: { path: `/product${string}` }) {
  const location = useLocation();
  return <Navigate replace to={productNavigationHref(path, location.search)} />;
}

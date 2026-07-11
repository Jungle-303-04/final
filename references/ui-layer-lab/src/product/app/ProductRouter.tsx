import { Navigate, Route, Routes } from "react-router-dom";
import { ProductStateScreen } from "../shared/ui/ProductStateScreen";
import { AuthSessionControl } from "../features/auth/AuthSessionControl";
import type { AuthenticatedAuthState } from "../features/auth/authContract";
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
        <Route path="*" element={<Navigate replace to={fallbackRoute.path} />} />
      </Route>
    </Routes>
  );
}

import { Navigate, Route, Routes } from "react-router-dom";
import { ProductStateScreen } from "../shared/ui/ProductStateScreen";
import { ProductShell } from "./ProductShell";
import type { ProductComposition } from "./productComposition";
import { routeDefinitionForCapability } from "./productRoutes";

export function ProductRouter({ composition }: { composition: ProductComposition }) {
  if (composition.surfaces.length === 0) {
    return <ProductStateScreen kind="release" />;
  }

  const fallbackRoute = routeDefinitionForCapability(composition.surfaces[0].id);

  return (
    <Routes>
      <Route element={<ProductShell availableCapabilities={composition.capabilities} />}>
        {composition.surfaces.map(({ id, Component }) => {
          const routeDefinition = routeDefinitionForCapability(id);
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

import type { ComponentType } from "react";
import {
  PRODUCT_ROUTE_CATALOG,
  type ProductSurfaceId,
} from "./productRoutes";
import type { AuthPort } from "../features/auth/authContract";
import type { ClusterScopePort } from "../features/cluster-scope/clusterScopeContract";

export interface ProductSurfaceRegistration {
  id: ProductSurfaceId;
  Component: ComponentType;
}

export interface ProductComposition {
  auth: AuthPort;
  clusterScope: ClusterScopePort;
  surfaces: readonly ProductSurfaceRegistration[];
  releasedSurfaceIds: ReadonlySet<ProductSurfaceId>;
}

export function createProductComposition(
  registrations: readonly ProductSurfaceRegistration[],
  auth: AuthPort,
  clusterScope: ClusterScopePort,
): ProductComposition {
  const byId = new Map<ProductSurfaceId, ProductSurfaceRegistration>();

  for (const registration of registrations) {
    if (byId.has(registration.id)) {
      throw new Error(`duplicate product surface: ${registration.id}`);
    }
    byId.set(registration.id, registration);
  }

  const surfaces = PRODUCT_ROUTE_CATALOG.flatMap((routeDefinition) => {
    const registration = byId.get(routeDefinition.id);
    return registration ? [registration] : [];
  });

  if (surfaces.length !== registrations.length) {
    const known = new Set(PRODUCT_ROUTE_CATALOG.map((routeDefinition) => routeDefinition.id));
    const unknown = registrations.find((registration) => !known.has(registration.id));
    throw new Error(`unknown product surface: ${String(unknown?.id)}`);
  }

  return {
    auth,
    clusterScope,
    surfaces,
    releasedSurfaceIds: new Set(surfaces.map((surface) => surface.id)),
  };
}

import type { ComponentType } from "react";
import {
  PRODUCT_ROUTE_CATALOG,
  type ProductCapabilityId,
} from "./productRoutes";

export interface ProductSurfaceRegistration {
  id: ProductCapabilityId;
  Component: ComponentType;
}

export interface ProductComposition {
  surfaces: readonly ProductSurfaceRegistration[];
  capabilities: ReadonlySet<ProductCapabilityId>;
}

export function createProductComposition(
  registrations: readonly ProductSurfaceRegistration[],
): ProductComposition {
  const byId = new Map<ProductCapabilityId, ProductSurfaceRegistration>();

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
    surfaces,
    capabilities: new Set(surfaces.map((surface) => surface.id)),
  };
}

import { routeDefinitionForSurface } from "../../app/productRoutes";
import { serializeProductFilterUrl } from "../../features/filters/filterUrl";
import type { UnifiedFilterState } from "../../features/filters/filterContract";

export function clusterResourcesHref(
  state: UnifiedFilterState,
  clusterId: string,
  resourceType?: string,
): string {
  const next = {
    ...state,
    common: { ...state.common, clusters: [clusterId] },
    resources: resourceType === undefined
      ? state.resources
      : { ...state.resources, types: [resourceType] },
  };
  return `${routeDefinitionForSurface("resources").path}${serializeProductFilterUrl(next)}`;
}

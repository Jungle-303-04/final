import { routeDefinitionForSurface } from "../../app/productRoutes";
import { serializeProductFilterUrl } from "../../features/filters/filterUrl";
import {
  createEmptyProductDetailQuery,
  type ProductDetailQuery,
  type UnifiedFilterState,
} from "../../features/filters/filterContract";

export function clusterResourcesHref(
  state: UnifiedFilterState,
  clusterId: string,
  resourceType?: string,
  detail?: ProductDetailQuery,
): string {
  const next = {
    ...state,
    common: { ...state.common, clusters: [clusterId] },
    resources: resourceType === undefined
      ? state.resources
      : { ...state.resources, types: [resourceType] },
  };
  // 클러스터로 진입할 때는 인프라(노드→파드) 토폴로지를 먼저 보여준다.
  // 사용자가 이미 목록/관계 뷰를 고른 경우 그 선택을 존중한다.
  const nextDetail: ProductDetailQuery = {
    ...(detail ?? createEmptyProductDetailQuery()),
    resourceSurfaceView: detail?.resourceSurfaceView ?? "map",
  };
  return `${routeDefinitionForSurface("resources").path}${serializeProductFilterUrl(next, nextDetail)}`;
}

import type {
  ProductDetailQuery,
  UnifiedFilterState,
} from "../features/filters/filterContract";
import type { AiAssistantContext } from "../features/ai-assistant/aiAssistantContract";
import type { ProductSurfaceId } from "./productRoutes";

export function createAiAssistantContext(
  screen: ProductSurfaceId,
  state: UnifiedFilterState,
  detail: ProductDetailQuery,
): AiAssistantContext {
  return {
    screen,
    filters: {
      clusters: [...state.common.clusters],
      namespaces: state.common.namespaces.map(
        ({ clusterId, namespace }) => `${clusterId}/${namespace}`,
      ),
      applications: [...state.common.applications],
      labels: state.common.labels.map(({ key, value }) => `${key}=${value}`),
      resourceTypes: [...state.resources.types],
      health: [...state.resources.health],
      query: state.resources.query,
    },
    selection: resourceSelection(detail),
    time: null,
  };
}

export function aiAssistantContextChips(context: AiAssistantContext): string[] {
  return [
    context.screen,
    ...context.filters.clusters,
    ...context.filters.namespaces,
    ...context.filters.applications,
    ...context.filters.labels,
    ...context.filters.resourceTypes,
    ...context.filters.health,
    ...(context.filters.query ? [context.filters.query] : []),
    ...(context.selection ? [context.selection.identity] : []),
  ];
}

function resourceSelection(
  detail: ProductDetailQuery,
): AiAssistantContext["selection"] {
  if (detail.detail) return { type: "resource", identity: detail.detail };
  if (!detail.resource || !detail.resourceKind) return null;
  return {
    type: "resource",
    identity: `${detail.resourceKind}/${detail.resource}`,
  };
}

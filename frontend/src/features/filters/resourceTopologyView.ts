import type { UnifiedFilterState } from "./filterContract";

export type ResourceTopologyView = "physical" | "relations";

export function deriveResourceTopologyView(
  state: UnifiedFilterState,
  options: { incidentSelected?: boolean } = {},
): ResourceTopologyView {
  if (options.incidentSelected) return "relations";
  const resourceTypes = new Set(
    state.resources.types.map((value) => value.trim().toLocaleLowerCase()),
  );
  if (state.common.applications.length > 0) {
    return resourceTypes.size === 1 && resourceTypes.has("pod")
      ? "physical"
      : "relations";
  }
  const nonPodTypes = [...resourceTypes].filter((value) => value && value !== "pod");
  return nonPodTypes.length >= 2 ? "relations" : "physical";
}

export function resolveResourceTopologyView(
  state: UnifiedFilterState,
  pinned: ResourceTopologyView | null | undefined,
  options: { incidentSelected?: boolean } = {},
): ResourceTopologyView {
  return pinned ?? deriveResourceTopologyView(state, options);
}

export function hasResourceTopologyFilters(state: UnifiedFilterState): boolean {
  return state.common.clusters.length > 0 ||
    state.common.namespaces.length > 0 ||
    state.common.applications.length > 0 ||
    state.common.labels.length > 0 ||
    state.resources.types.length > 0 ||
    state.resources.health.length > 0 ||
    state.resources.includeDeleted ||
    state.resources.query.length > 0;
}

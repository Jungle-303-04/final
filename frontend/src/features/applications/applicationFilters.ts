import {
  createEmptyProductDetailQuery,
  createEmptyUnifiedFilterState,
  type UnifiedFilterState,
} from "../filters/filterContract";
import { serializeProductFilterUrl } from "../filters/filterUrl";
import type { ApplicationCatalogFilter } from "./applicationsContract";

export function applicationCatalogFilterFromState(
  state: UnifiedFilterState,
): ApplicationCatalogFilter {
  return {
    clusters: state.common.clusters,
    namespaces: state.common.namespaces.map(({ clusterId, namespace }) => `${clusterId}/${namespace}`),
    applications: state.common.applications,
    labels: state.common.labels.map(({ key, value }) => `${key}=${value}`),
    environments: state.applicationSurface.environment,
    statuses: state.applicationSurface.status,
    pendingPromotion: state.applicationSurface.pendingPromotion,
    query: state.applicationSurface.query,
  };
}

export function applicationOwnedSurfaceHref(
  path: "/resources" | "/issues",
  state: UnifiedFilterState,
  applicationId: string,
): string {
  const next = createEmptyUnifiedFilterState();
  next.common = {
    ...state.common,
    applications: [applicationId],
  };
  return `${path}${serializeProductFilterUrl(next)}`;
}

export function applicationGitOpsChangeHref(
  state: UnifiedFilterState,
  changeId: string,
): string {
  const next = createEmptyUnifiedFilterState();
  next.common = { ...state.common };
  return `/gitops${serializeProductFilterUrl(next, {
    ...createEmptyProductDetailQuery(),
    detail: `change:${changeId}`,
  })}`;
}

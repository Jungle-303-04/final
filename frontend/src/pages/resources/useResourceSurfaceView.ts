import { useCallback, useEffect } from "react";

import type { ResourceSurfaceView } from "../../features/filters/filterContract";
import { useUnifiedFilter } from "../../features/filters/UnifiedFilterProvider";

export function useResourceSurfaceView(onMapSelected: () => void): {
  setView: (view: ResourceSurfaceView) => void;
  view: ResourceSurfaceView;
} {
  const filter = useUnifiedFilter();
  const view = filter.detail.resourceSurfaceView
    ?? (filter.detail.resourceTopologyView ? "map" : "list");

  useEffect(() => {
    if (
      filter.detail.resourceSurfaceView === undefined ||
      filter.detail.resourceSurfaceView === null ||
      filter.state.resources.view === "table"
    ) return;
    filter.updateFilters(
      (current) => ({
        ...current,
        resources: { ...current.resources, view: "table" },
      }),
      "legacy-migration",
    );
  }, [filter]);

  const setView = useCallback((next: ResourceSurfaceView) => {
    if (next === "map") onMapSelected();
    filter.updateDetail(
      (current) => ({ ...current, resourceSurfaceView: next }),
      "resource-surface-view",
    );
  }, [filter, onMapSelected]);

  return { setView, view };
}

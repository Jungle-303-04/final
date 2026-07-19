import { useEffect } from "react";

import { useUnifiedFilter } from "../../features/filters/UnifiedFilterProvider";
import {
  hasResourceTopologyFilters,
  resolveResourceTopologyView,
  type ResourceTopologyView,
} from "../../features/filters/resourceTopologyView";

export function useResourceTopologyViewController() {
  const filter = useUnifiedFilter();
  const pinnedView = filter.detail.resourceTopologyView ?? null;
  const view = resolveResourceTopologyView(filter.state, pinnedView);

  useEffect(() => {
    if (pinnedView === null || hasResourceTopologyFilters(filter.state)) return;
    filter.updateDetail(
      (current) => ({ ...current, resourceTopologyView: null }),
      "topology-view-reset",
    );
  }, [filter, pinnedView]);

  const pin = (nextView: ResourceTopologyView) => filter.updateDetail(
    (current) => ({
      ...current,
      resourceSurfaceView: null,
      resourceTopologyView: nextView,
      workflowView: null,
    }),
    "topology-view",
  );

  return { pin, pinned: pinnedView !== null, view };
}

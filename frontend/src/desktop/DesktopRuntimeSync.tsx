import { useCallback, useEffect } from "react";
import { useNavigate } from "react-router-dom";

import { useClusterScope } from "../features/cluster-scope/ClusterScopeProvider";
import { useUnifiedFilter } from "../features/filters/UnifiedFilterProvider";
import { desktopBridge } from "./desktopBridge";

export function DesktopRuntimeSync() {
  const clusterScope = useClusterScope();
  const filter = useUnifiedFilter();
  const navigate = useNavigate();
  const selectedCluster = clusterScope.selectedCluster;
  const navigateToSettings = useCallback(() => {
    navigate(filter.navigationHref("/settings"));
  }, [filter, navigate]);

  useEffect(() => {
    void desktopBridge.setActiveClusterTitle({
      clusterId: selectedCluster?.id ?? null,
      displayName: selectedCluster?.name ?? null,
    }).catch(() => undefined);
  }, [selectedCluster?.id, selectedCluster?.name]);

  useEffect(() => desktopBridge.onMenuAction((action) => {
    if (action === "settings") navigateToSettings();
    if (action === "reload") window.location.reload();
  }), [navigateToSettings]);

  return null;
}

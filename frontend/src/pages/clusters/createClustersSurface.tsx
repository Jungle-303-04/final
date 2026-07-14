import type { ComponentType } from "react";
import { ClustersPage } from "./ClustersPage";

export function createClustersSurface(): ComponentType {
  function ClustersSurface() {
    return <ClustersPage />;
  }

  ClustersSurface.displayName = "ClustersSurface";
  return ClustersSurface;
}

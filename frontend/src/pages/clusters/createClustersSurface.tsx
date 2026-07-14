import type { ComponentType } from "react";
import type { ClustersPort } from "../../features/clusters/clustersContract";
import { ClustersPage } from "./ClustersPage";

export function createClustersSurface(port: ClustersPort): ComponentType {
  function ClustersSurface() {
    return <ClustersPage port={port} />;
  }

  ClustersSurface.displayName = "ClustersSurface";
  return ClustersSurface;
}

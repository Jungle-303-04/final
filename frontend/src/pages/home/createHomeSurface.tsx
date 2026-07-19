import type { ComponentType } from "react";
import type {
  ClusterDisconnectPort,
  ClustersPort,
} from "../../features/clusters/clustersContract";
import type { HomePort } from "../../features/home/homeContract";
import { HomePage } from "./HomePage";

export function createHomeSurface(
  port: HomePort,
  clusterPort?: ClustersPort & ClusterDisconnectPort,
): ComponentType {
  function HomeSurface() {
    return <HomePage clusterPort={clusterPort} port={port} />;
  }

  HomeSurface.displayName = "HomeSurface";
  return HomeSurface;
}

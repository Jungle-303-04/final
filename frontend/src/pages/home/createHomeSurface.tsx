import type { ComponentType } from "react";
import type {
  ClusterDisconnectPort,
  ClustersPort,
} from "../../features/clusters/clustersContract";
import type { HomePort } from "../../features/home/homeContract";
import { HomePage } from "./HomePage";
import type { HomeBoardPorts } from "./useHomeBoardData";

export function createHomeSurface(
  port: HomePort,
  boardPorts: HomeBoardPorts,
  clusterPort?: ClustersPort & ClusterDisconnectPort,
): ComponentType {
  function HomeSurface() {
    return <HomePage boardPorts={boardPorts} clusterPort={clusterPort} port={port} />;
  }

  HomeSurface.displayName = "HomeSurface";
  return HomeSurface;
}

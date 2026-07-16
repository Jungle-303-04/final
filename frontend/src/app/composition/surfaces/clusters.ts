import type { ComponentType } from "react";
import {
  connectCluster,
  getClusterConnectionStatus,
  getCommandStatus,
  reissueClusterConnectCommand,
  unregisterCluster,
} from "../../../api";
import { createClustersAdapter } from "../../../features/clusters/createClustersAdapter";
import { createClustersSurface } from "../../../pages/clusters/createClustersSurface";

export function loadClustersSurface(): ComponentType {
  return createClustersSurface(createClustersAdapter({
    connectCluster,
    getClusterConnectionStatus,
    getCommandStatus,
    reissueClusterConnectCommand,
    unregisterCluster,
  }));
}

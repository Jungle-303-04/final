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

export function createClustersProductPort() {
  return createClustersAdapter({
    connectCluster,
    getClusterConnectionStatus,
    getCommandStatus,
    reissueClusterConnectCommand,
    unregisterCluster,
  });
}

export function loadClustersSurface(): ComponentType {
  return createClustersSurface(createClustersProductPort());
}

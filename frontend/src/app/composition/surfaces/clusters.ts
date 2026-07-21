import type { ComponentType } from "react";
import {
  connectCluster,
  getClusterConnectionStatus,
  getCommandStatus,
  reissueClusterConnectCommand,
  unregisterCluster,
} from "../../../api";
import { createClustersAdapter } from "../../../features/clusters/createClustersAdapter";
import type { ClusterDisconnectPort } from "../../../features/clusters/clustersContract";
import { createClustersSurface } from "../../../pages/clusters/createClustersSurface";

export function loadClustersSurface(): ComponentType {
  return createClustersSurface(createClustersPort());
}

/** Canonical authenticated lifecycle port shared by both active shells. */
export function createClusterDisconnectPort(): ClusterDisconnectPort {
  return createClustersPort();
}

function createClustersPort() {
  return createClustersAdapter({
    connectCluster,
    getClusterConnectionStatus,
    getCommandStatus,
    reissueClusterConnectCommand,
    unregisterCluster,
  });
}

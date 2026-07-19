import {
  connectCluster,
  getClusterConnectionStatus,
  getCommandStatus,
  reissueClusterConnectCommand,
  unregisterCluster,
} from "../../../api";
import { createClustersAdapter } from "../../../features/clusters/createClustersAdapter";

export function createClustersProductPort() {
  return createClustersAdapter({
    connectCluster,
    getClusterConnectionStatus,
    getCommandStatus,
    reissueClusterConnectCommand,
    unregisterCluster,
  });
}

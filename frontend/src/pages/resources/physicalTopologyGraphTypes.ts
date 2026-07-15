import type { Node } from "@xyflow/react";
import type { HomePort } from "../../features/home/homeContract";
import type { PhysicalServerPlacement } from "./physicalTopologyViewModel";

export interface PhysicalPodOpenTarget {
  name: string;
  namespace: string | null;
}

export interface PhysicalServerNodeData extends Record<string, unknown> {
  clusterId: string;
  index: number;
  nodePodsPort: Pick<HomePort, "loadNodePods">;
  onNodePodsUnauthorized: () => void;
  placement: PhysicalServerPlacement;
  onOpenPod: (pod: PhysicalPodOpenTarget) => void;
  onRevealServer: (serverId: string) => void;
}

export type PhysicalServerNode = Node<PhysicalServerNodeData, "physical-server">;

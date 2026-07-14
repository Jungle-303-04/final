import type { Node } from "@xyflow/react";
import type { PhysicalTopologyPod } from "../../features/resources/physicalTopologyContract";
import type { PhysicalServerPlacement } from "./physicalTopologyViewModel";

export interface PhysicalServerNodeData extends Record<string, unknown> {
  clusterId: string;
  index: number;
  placement: PhysicalServerPlacement;
  onOpenPod: (pod: PhysicalTopologyPod) => void;
  onRevealServer: (serverId: string) => void;
}

export type PhysicalServerNode = Node<PhysicalServerNodeData, "physical-server">;

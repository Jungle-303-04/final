import type { Node } from "@xyflow/react";
import type { RelationTopologyGraphNode } from "../../features/resources/relationTopologyGraphModel";

export interface RelationTopologyNodeData extends Record<string, unknown> {
  graphNode: RelationTopologyGraphNode;
  onSelect: (resourceId: string) => void;
  selected: boolean;
}

export type RelationGraphNode = Node<RelationTopologyNodeData, "relation-resource">;

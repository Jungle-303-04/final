import type { Node } from "@xyflow/react";
import type { RelationTopologyNode as RelationNode } from "../../features/resources/relationTopologyContract";

export interface RelationTopologyNodeData extends Record<string, unknown> {
  resource: RelationNode;
}

export type RelationGraphNode = Node<RelationTopologyNodeData, "relation-resource">;

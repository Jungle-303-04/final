import type { Edge, Node } from "@xyflow/react";

export type DeploymentBlueprintNodeKind = "repository" | "deployment" | "cluster";

export interface DeploymentBlueprintNodeData extends Record<string, unknown> {
  kind: DeploymentBlueprintNodeKind;
  title: string;
  subtitle: string;
  applicationId?: string;
  branch?: string;
  clusterId?: string;
  connectionStatus?: string;
  connectionCount?: number;
  connected: boolean;
  environment?: string;
  manifestPath?: string;
  placeholder: boolean;
  stepId?: string;
}

export type DeploymentBlueprintNode = Node<
  DeploymentBlueprintNodeData,
  "deploymentBlueprint"
>;

export type DeploymentBlueprintEdge = Edge;

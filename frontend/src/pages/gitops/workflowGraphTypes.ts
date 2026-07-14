import type { Edge, Node } from "@xyflow/react";

export type FlowDirection = "LR" | "TB";
export type WorkflowNodeKind = "application" | "approval" | "preflight" | "verification";
export type WorkflowTone = "neutral" | "success" | "warning" | "danger" | "info";

export interface WorkflowNodeData extends Record<string, unknown> {
  kind: WorkflowNodeKind;
  title: string;
  eyebrow: string;
  status: string;
  statusLabel: string;
  environment?: string;
  strategy?: string;
  cluster?: string;
  ownerStepId?: string;
  selected: boolean;
  compact: boolean;
  showMetadata: boolean;
  direction: FlowDirection;
  tone: WorkflowTone;
}

export interface WorkflowNodeInput {
  kind: WorkflowNodeKind;
  title: string;
  eyebrow: string;
  status: string;
  environment?: string;
  strategy?: string;
  cluster?: string;
  ownerStepId?: string;
  selected: boolean;
}

export interface GraphOptions {
  showCheckpoints: boolean;
  showMetadata: boolean;
  compact: boolean;
  direction: FlowDirection;
  narrow: boolean;
}

export type WorkflowNode = Node<WorkflowNodeData>;
export type WorkflowEdge = Edge;

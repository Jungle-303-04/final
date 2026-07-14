import { Position } from "@xyflow/react";
import ELK from "elkjs/lib/elk.bundled.js";
import type { ElkNode } from "elkjs/lib/elk-api";
import { useEffect, useMemo, useState } from "react";
import type { FlowDirection, WorkflowEdge, WorkflowNode } from "./workflowGraphTypes";

const elk = new ELK();

export function useWorkflowLayout(
  nodes: WorkflowNode[],
  edges: WorkflowEdge[],
  direction: FlowDirection,
  narrow: boolean,
) {
  const [layout, setLayout] = useState({ nodes, edges });
  const signature = useMemo(() => [
    direction,
    narrow ? "narrow" : "wide",
    nodes.map((node) => `${node.id}:${node.width}x${node.height}`).join("|"),
    edges.map((edge) => `${edge.source}->${edge.target}`).join("|"),
  ].join("::"), [direction, edges, narrow, nodes]);

  useEffect(() => {
    let cancelled = false;
    if (!nodes.length) return () => { cancelled = true; };
    const horizontal = direction === "LR";
    const graph: ElkNode = {
      id: "root",
      layoutOptions: {
        "elk.algorithm": "layered",
        "elk.direction": horizontal ? "RIGHT" : "DOWN",
        "elk.spacing.nodeNode": String(narrow ? 12 : 96),
        "elk.layered.spacing.nodeNodeBetweenLayers": String(narrow ? 56 : 72),
        "elk.layered.spacing.edgeNodeBetweenLayers": String(narrow ? 20 : 32),
        "elk.layered.spacing.edgeEdgeBetweenLayers": String(narrow ? 16 : 24),
        "elk.layered.nodePlacement.strategy": "NETWORK_SIMPLEX",
      },
      children: nodes.map((node) => ({
        id: node.id,
        width: node.width ?? 168,
        height: node.height ?? 48,
      })),
      edges: edges.map((edge) => ({ id: edge.id, sources: [edge.source], targets: [edge.target] })),
    };
    void elk.layout(graph).then((result) => {
      if (cancelled) return;
      const positions = new Map((result.children ?? []).map((child) => [child.id, child]));
      setLayout({
        nodes: nodes.map((node) => {
          const position = positions.get(node.id);
          return {
            ...node,
            position: { x: position?.x ?? 0, y: position?.y ?? 0 },
            sourcePosition: horizontal ? Position.Right : Position.Bottom,
            targetPosition: horizontal ? Position.Left : Position.Top,
          };
        }),
        edges,
      });
    }).catch(() => {
      if (!cancelled) setLayout({ nodes, edges });
    });
    return () => { cancelled = true; };
  }, [direction, edges, narrow, nodes, signature]);

  return nodes.length ? layout : { nodes, edges };
}

export function isNarrowGraphViewport(): boolean {
  return typeof window !== "undefined"
    && typeof window.matchMedia === "function"
    && window.matchMedia("(max-width: 900px)").matches;
}

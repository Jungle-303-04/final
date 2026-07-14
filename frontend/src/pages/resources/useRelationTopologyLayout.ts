import ELK from "elkjs/lib/elk.bundled.js";
import type { ElkNode } from "elkjs/lib/elk-api";
import { useEffect, useMemo, useState } from "react";
import type { Edge } from "@xyflow/react";

import type { RelationGraphNode } from "./relationTopologyGraphTypes";

const elk = new ELK();
const NODE_WIDTH = 176;
const NODE_HEIGHT = 88;

export function useRelationTopologyLayout(nodes: RelationGraphNode[], edges: Edge[]) {
  const initial = useMemo(() => nodes.map((node, index) => ({
    ...node,
    position: { x: (index % 4) * 216, y: Math.floor(index / 4) * 120 },
  })), [nodes]);
  const signature = `${nodes.map((node) => node.id).join("|")}::${edges.map(
    (edge) => `${edge.source}>${edge.target}`,
  ).join("|")}`;
  const [layout, setLayout] = useState<{ signature: string; nodes: RelationGraphNode[] }>({
    signature: "",
    nodes: [],
  });

  useEffect(() => {
    let cancelled = false;
    if (nodes.length === 0) return () => { cancelled = true; };
    const graph: ElkNode = {
      id: "relations-root",
      layoutOptions: {
        "elk.algorithm": "layered",
        "elk.direction": "RIGHT",
        "elk.spacing.nodeNode": "28",
        "elk.layered.spacing.nodeNodeBetweenLayers": "54",
        "elk.layered.nodePlacement.strategy": "NETWORK_SIMPLEX",
      },
      children: nodes.map((node) => ({ id: node.id, width: NODE_WIDTH, height: NODE_HEIGHT })),
      edges: edges.map((edge) => ({
        id: edge.id,
        sources: [edge.source],
        targets: [edge.target],
      })),
    };
    void elk.layout(graph).then((result) => {
      if (cancelled) return;
      const positions = new Map((result.children ?? []).map((node) => [node.id, node]));
      setLayout({
        signature,
        nodes: nodes.map((node, index) => ({
          ...node,
          position: {
            x: positions.get(node.id)?.x ?? initial[index]?.position.x ?? 0,
            y: positions.get(node.id)?.y ?? initial[index]?.position.y ?? 0,
          },
        })),
      });
    }).catch(() => {
      if (!cancelled) setLayout({ signature, nodes: initial });
    });
    return () => { cancelled = true; };
  }, [edges, initial, nodes, signature]);

  return layout.signature === signature ? layout.nodes : initial;
}

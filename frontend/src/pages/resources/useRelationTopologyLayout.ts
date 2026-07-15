import ELK from "elkjs/lib/elk.bundled.js";
import type { ElkNode } from "elkjs/lib/elk-api";
import { useEffect, useRef, useState } from "react";
import type { Edge } from "@xyflow/react";

import type { RelationGraphNode } from "./relationTopologyGraphTypes";

const elk = new ELK();
const NODE_WIDTH = 176;
const NODE_HEIGHT = 88;

export function useRelationTopologyLayout(nodes: RelationGraphNode[], edges: Edge[]) {
  const signature = `${nodes.map((node) => node.id).join("|")}::${edges.map(
    (edge) => `${edge.id}:${edge.source}>${edge.target}`,
  ).join("|")}`;
  const topologyRef = useRef({ nodes, edges });
  useEffect(() => {
    topologyRef.current = { nodes, edges };
  }, [edges, nodes]);
  const [layout, setLayout] = useState<{
    signature: string;
    positions: Map<string, { x: number; y: number }>;
  }>({
    signature: "",
    positions: new Map(),
  });

  useEffect(() => {
    let cancelled = false;
    const current = topologyRef.current;
    const fallback = fallbackPositions(current.nodes);
    if (current.nodes.length === 0) return () => { cancelled = true; };
    const graph: ElkNode = {
      id: "relations-root",
      layoutOptions: {
        "elk.algorithm": "layered",
        "elk.direction": "RIGHT",
        "elk.spacing.nodeNode": "28",
        "elk.layered.spacing.nodeNodeBetweenLayers": "54",
        "elk.layered.nodePlacement.strategy": "NETWORK_SIMPLEX",
      },
      children: current.nodes.map((node) => ({ id: node.id, width: NODE_WIDTH, height: NODE_HEIGHT })),
      edges: current.edges.map((edge) => ({
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
        positions: new Map(current.nodes.map((node) => [node.id, {
          x: positions.get(node.id)?.x ?? fallback.get(node.id)?.x ?? 0,
          y: positions.get(node.id)?.y ?? fallback.get(node.id)?.y ?? 0,
        }])),
      });
    }).catch(() => {
      if (!cancelled) setLayout({ signature, positions: fallback });
    });
    return () => { cancelled = true; };
  }, [signature]);

  const positions = layout.signature === signature
    ? layout.positions
    : fallbackPositions(nodes);
  return nodes.map((node) => ({
    ...node,
    position: positions.get(node.id) ?? { x: 0, y: 0 },
  }));
}

function fallbackPositions(nodes: RelationGraphNode[]) {
  return new Map(nodes.map((node, index) => [node.id, {
    x: (index % 4) * 216,
    y: Math.floor(index / 4) * 120,
  }]));
}

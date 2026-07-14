import ELK from "elkjs/lib/elk.bundled.js";
import type { ElkNode } from "elkjs/lib/elk-api";
import { useEffect, useMemo, useState } from "react";

import type { PhysicalServerNode } from "./physicalTopologyGraphTypes";

const elk = new ELK();

export function usePhysicalTopologyLayout(nodes: PhysicalServerNode[]) {
  const initial = useMemo(
    () => nodes.map((node, index) => ({
      ...node,
      position: { x: index * ((node.width ?? 264) + 24), y: 0 },
    })),
    [nodes],
  );
  const [layout, setLayout] = useState<{
    signature: string;
    nodes: PhysicalServerNode[];
  }>({ signature: "", nodes: [] });
  const signature = nodes.map(
    (node) => `${node.id}:${node.width ?? 0}x${node.height ?? 0}`,
  ).join("|");

  useEffect(() => {
    let cancelled = false;
    if (nodes.length === 0) return () => { cancelled = true; };
    const graph: ElkNode = {
      id: "physical-root",
      layoutOptions: {
        "elk.algorithm": "layered",
        "elk.direction": "RIGHT",
        "elk.spacing.nodeNode": "24",
        "elk.layered.spacing.nodeNodeBetweenLayers": "24",
        "elk.layered.nodePlacement.strategy": "NETWORK_SIMPLEX",
      },
      children: nodes.map((node) => ({
        id: node.id,
        width: node.width ?? 264,
        height: node.height ?? 208,
      })),
      edges: [],
    };
    void elk.layout(graph).then((result) => {
      if (cancelled) return;
      const positions = new Map(
        (result.children ?? []).map((child) => [child.id, child]),
      );
      setLayout({ signature, nodes: nodes.map((node, index) => {
        const position = positions.get(node.id);
        return {
          ...node,
          position: {
            x: position?.x ?? initial[index]?.position.x ?? 0,
            y: position?.y ?? 0,
          },
        };
      }) });
    }).catch(() => {
      if (!cancelled) setLayout({ signature, nodes: initial });
    });
    return () => { cancelled = true; };
  }, [initial, nodes, signature]);

  return layout.signature === signature ? layout.nodes : initial;
}

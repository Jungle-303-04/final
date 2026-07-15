import { useMemo } from "react";

import type { PhysicalServerNode } from "./physicalTopologyGraphTypes";

export function usePhysicalTopologyLayout(nodes: PhysicalServerNode[]) {
  return useMemo(() => {
    const columns = physicalTopologyColumnCount(nodes.length);
    return nodes.map((node, index) => ({
      ...node,
      position: {
        x: (index % columns) * ((node.width ?? 264) + 24),
        y: Math.floor(index / columns) * ((node.height ?? 208) + 24),
      },
    }));
  }, [nodes]);
}

export function physicalTopologyColumnCount(nodeCount: number): number {
  if (nodeCount <= 1) return 1;
  return Math.ceil(Math.sqrt(nodeCount * 2));
}

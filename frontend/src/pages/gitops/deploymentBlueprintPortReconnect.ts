import type { OnConnectStartParams } from "@xyflow/react";
import type { DeploymentBlueprintEdge } from "./deploymentBlueprintTypes";

export function findPortReconnectEdge(
  edges: DeploymentBlueprintEdge[],
  params: OnConnectStartParams,
  nodeLayerOrder: readonly string[] = [],
): DeploymentBlueprintEdge | null {
  if (!params.nodeId || params.handleType !== "target") return null;

  const connectedEdges = edges.filter((edge) => (
    edge.target === params.nodeId && sameHandle(edge.targetHandle, params.handleId)
  ));

  if (connectedEdges.length === 1) return connectedEdges[0];
  if (connectedEdges.length === 0) return null;

  const layerByNodeId = new Map(nodeLayerOrder.map((nodeId, index) => [nodeId, index]));
  return connectedEdges.reduce((highest, edge) => {
    const highestLayer = layerByNodeId.get(highest.source) ?? -1;
    const edgeLayer = layerByNodeId.get(edge.source) ?? -1;
    return edgeLayer >= highestLayer ? edge : highest;
  });
}

function sameHandle(edgeHandle: string | null | undefined, handleId: string | null): boolean {
  return (edgeHandle ?? null) === handleId;
}

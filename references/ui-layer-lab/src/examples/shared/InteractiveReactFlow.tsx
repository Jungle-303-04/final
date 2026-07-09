import {
  addEdge,
  ReactFlow,
  useEdgesState,
  useNodesState,
  type Connection,
  type Edge,
  type EdgeChange,
  type Node,
  type NodeChange,
  type ReactFlowProps
} from "@xyflow/react";
import { useCallback, useEffect } from "react";

type InteractiveReactFlowProps<NodeType extends Node = Node, EdgeType extends Edge = Edge> = ReactFlowProps<NodeType, EdgeType>;

export function InteractiveReactFlow<NodeType extends Node = Node, EdgeType extends Edge = Edge>({
  nodes = [],
  edges = [],
  onNodesChange,
  onEdgesChange,
  onConnect,
  nodesDraggable = true,
  nodesConnectable = true,
  elementsSelectable = true,
  ...props
}: InteractiveReactFlowProps<NodeType, EdgeType>) {
  const [internalNodes, setInternalNodes, handleNodesChange] = useNodesState<NodeType>(nodes);
  const [internalEdges, setInternalEdges, handleEdgesChange] = useEdgesState<EdgeType>(edges);

  useEffect(() => {
    setInternalNodes(nodes);
  }, [nodes, setInternalNodes]);

  useEffect(() => {
    setInternalEdges(edges);
  }, [edges, setInternalEdges]);

  const mergedNodesChange = useCallback(
    (changes: NodeChange<NodeType>[]) => {
      handleNodesChange(changes);
      onNodesChange?.(changes);
    },
    [handleNodesChange, onNodesChange]
  );

  const mergedEdgesChange = useCallback(
    (changes: EdgeChange<EdgeType>[]) => {
      handleEdgesChange(changes);
      onEdgesChange?.(changes);
    },
    [handleEdgesChange, onEdgesChange]
  );

  const mergedConnect = useCallback(
    (connection: Connection) => {
      setInternalEdges((current) => addEdge(connection, current) as EdgeType[]);
      onConnect?.(connection);
    },
    [onConnect, setInternalEdges]
  );

  return (
    <ReactFlow
      {...props}
      edges={internalEdges}
      elementsSelectable={elementsSelectable}
      nodes={internalNodes}
      nodesConnectable={nodesConnectable}
      nodesDraggable={nodesDraggable}
      onConnect={mergedConnect}
      onEdgesChange={mergedEdgesChange}
      onNodesChange={mergedNodesChange}
    />
  );
}

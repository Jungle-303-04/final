import { addEdge, Background, Controls, ReactFlow, useEdgesState, useNodesState, type Connection, type Edge } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useCallback, useState } from "react";

const initialNodes = [
  { id: "start", position: { x: 0, y: 90 }, data: { label: "Start" } },
  { id: "review", position: { x: 260, y: 20 }, data: { label: "Review" } },
  { id: "deploy", position: { x: 260, y: 160 }, data: { label: "Deploy" } }
];

const initialEdges = [{ id: "start-review", source: "start", target: "review" }];

export default function ReactFlowValidationExample() {
  const [nodes, , onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const [message, setMessage] = useState("Connections into Start are blocked.");

  const isValidConnection = useCallback((connection: Connection | Edge) => connection.target !== "start", []);
  const onConnect = useCallback(
    (connection: Connection) => {
      const valid = isValidConnection(connection);
      setMessage(valid ? "Connection accepted." : "Cannot connect back into Start.");
      if (valid) setEdges((items) => addEdge(connection, items));
    },
    [isValidConnection, setEdges]
  );

  return (
    <div className="flow-shell">
      <span className="muted">{message}</span>
      <div className="flow-example">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          isValidConnection={isValidConnection}
          fitView
        >
          <Background />
          <Controls />
        </ReactFlow>
      </div>
    </div>
  );
}

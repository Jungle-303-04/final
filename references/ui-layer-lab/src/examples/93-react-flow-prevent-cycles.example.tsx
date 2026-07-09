import { addEdge, Background, ReactFlow, getOutgoers, useEdgesState, useNodesState, type Connection, type Edge, type Node } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useCallback, useState } from "react";

const initialNodes: Node[] = [
  { id: "a", position: { x: 0, y: 80 }, data: { label: "A" } },
  { id: "b", position: { x: 240, y: 80 }, data: { label: "B" } },
  { id: "c", position: { x: 480, y: 80 }, data: { label: "C" } }
];

const initialEdges: Edge[] = [
  { id: "a-b", source: "a", target: "b" },
  { id: "b-c", source: "b", target: "c" }
];

export default function ReactFlowPreventCyclesExample() {
  const [nodes, , onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const [message, setMessage] = useState("Try connecting C back to A.");

  const createsCycle = useCallback(
    (connection: Connection) => {
      const target = nodes.find((node) => node.id === connection.target);
      const source = nodes.find((node) => node.id === connection.source);
      if (!target || !source) return false;

      const visited = new Set<string>();
      const hasPath = (node: Node): boolean => {
        if (visited.has(node.id)) return false;
        visited.add(node.id);
        return getOutgoers(node, nodes, edges).some((outgoer) => outgoer.id === source.id || hasPath(outgoer));
      };

      return hasPath(target);
    },
    [edges, nodes]
  );

  const onConnect = useCallback(
    (connection: Connection) => {
      if (createsCycle(connection)) {
        setMessage("Cycle blocked.");
        return;
      }
      setMessage("Connection added.");
      setEdges((items) => addEdge(connection, items));
    },
    [createsCycle, setEdges]
  );

  return (
    <div className="flow-shell">
      <span className="muted">{message}</span>
      <div className="flow-example">
        <ReactFlow nodes={nodes} edges={edges} onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} onConnect={onConnect} fitView>
          <Background />
        </ReactFlow>
      </div>
    </div>
  );
}

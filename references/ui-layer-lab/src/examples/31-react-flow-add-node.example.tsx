import { addEdge, Background, Controls, ReactFlow, useEdgesState, useNodesState, type Connection } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useCallback } from "react";

const initialNodes = [
  { id: "1", position: { x: 0, y: 80 }, data: { label: "시작" } },
  { id: "2", position: { x: 260, y: 80 }, data: { label: "검토" } }
];

const initialEdges = [{ id: "1-2", source: "1", target: "2" }];

export default function ReactFlowAddNodeExample() {
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  const onConnect = useCallback(
    (connection: Connection) => setEdges((items) => addEdge(connection, items)),
    [setEdges]
  );

  function addNode() {
    const id = String(nodes.length + 1);
    setNodes((items) => [
      ...items,
      {
        id,
        position: { x: 120 + items.length * 100, y: 220 },
        data: { label: `단계 ${id}` }
      }
    ]);
  }

  return (
    <div className="flow-shell">
      <button className="command-trigger" onClick={addNode}>
        노드 추가
      </button>
      <div className="flow-example">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          fitView
        >
          <Background />
          <Controls />
        </ReactFlow>
      </div>
    </div>
  );
}

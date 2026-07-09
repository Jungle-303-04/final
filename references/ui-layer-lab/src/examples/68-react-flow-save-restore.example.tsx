import { Background, Controls, ReactFlow, useEdgesState, useNodesState } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useState } from "react";

const initialNodes = [
  { id: "1", position: { x: 0, y: 80 }, data: { label: "초안" } },
  { id: "2", position: { x: 260, y: 80 }, data: { label: "배포" } }
];

const initialEdges = [{ id: "1-2", source: "1", target: "2" }];

export default function ReactFlowSaveRestoreExample() {
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const [snapshot, setSnapshot] = useState<{ nodes: typeof nodes; edges: typeof edges } | null>(null);

  return (
    <div className="flow-shell">
      <div className="segmented-row">
        <button onClick={() => setSnapshot({ nodes, edges })} type="button">저장</button>
        <button
          onClick={() => {
            if (!snapshot) return;
            setNodes(snapshot.nodes);
            setEdges(snapshot.edges);
          }}
          type="button"
        >
          복원
        </button>
      </div>
      <div className="flow-example">
        <ReactFlow nodes={nodes} edges={edges} onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} fitView>
          <Background />
          <Controls />
        </ReactFlow>
      </div>
    </div>
  );
}

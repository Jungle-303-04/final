import { Background, ReactFlow, useNodesState } from "@xyflow/react";
import "@xyflow/react/dist/style.css";

const initialNodes = [
  { id: "1", position: { x: 120, y: 80 }, data: { label: "대기 중" } },
  { id: "2", position: { x: 380, y: 80 }, data: { label: "준비 중" } }
];

const edges = [{ id: "1-2", source: "1", target: "2" }];

export default function ReactFlowUpdateNodeDataExample() {
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);

  function markRunning() {
    setNodes((items) => items.map((node) => (node.id === "1" ? { ...node, data: { label: "실행 중" } } : node)));
  }

  return (
    <div className="flow-shell">
      <button className="command-trigger stable-wide" onClick={markRunning} type="button">실행 중으로 표시</button>
      <div className="flow-example">
        <ReactFlow nodes={nodes} edges={edges} onNodesChange={onNodesChange} fitView>
          <Background />
        </ReactFlow>
      </div>
    </div>
  );
}

import { Background, ReactFlow, useNodesState } from "@xyflow/react";
import "@xyflow/react/dist/style.css";

const initialNodes = [
  { id: "1", position: { x: 120, y: 80 }, data: { label: "Queued" } },
  { id: "2", position: { x: 380, y: 80 }, data: { label: "Waiting" } }
];

const edges = [{ id: "1-2", source: "1", target: "2" }];

export default function ReactFlowUpdateNodeDataExample() {
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);

  function markRunning() {
    setNodes((items) => items.map((nodes) => (nodes.id === "1" ? { ...nodes, data: { label: "Running" } } : nodes)));
  }

  return (
    <div className="flow-shell">
      <button className="command-trigger" onClick={markRunning}>Mark Running</button>
      <div className="flow-example">
        <ReactFlow nodes={nodes} edges={edges} onNodesChange={onNodesChange} fitView>
          <Background />
        </ReactFlow>
      </div>
    </div>
  );
}

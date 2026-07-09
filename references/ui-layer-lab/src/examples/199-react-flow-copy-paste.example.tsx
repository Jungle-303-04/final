import { Background, ReactFlow, type Node } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useState } from "react";

const initialNodes: Node[] = [{ id: "1", position: { x: 180, y: 160 }, data: { label: "Selected nodes" } }];

export default function ReactFlowCopyPasteExample() {
  const [nodes, setNodes] = useState<Node[]>(initialNodes);

  function duplicate() {
    setNodes((items) => [
      ...items,
      { id: String(items.length + 1), position: { x: 180 + items.length * 80, y: 160 + items.length * 45 }, data: { label: `Copy ${items.length}` } }
    ]);
  }

  return (
    <div className="flow-shell">
      <button className="command-trigger" onClick={duplicate}>Duplicate Node</button>
      <div className="flow-example">
        <ReactFlow nodes={nodes} edges={[]} fitView>
          <Background />
        </ReactFlow>
      </div>
    </div>
  );
}

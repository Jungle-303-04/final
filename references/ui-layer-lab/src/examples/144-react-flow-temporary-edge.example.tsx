import { Background, ReactFlow, type Edge } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useState } from "react";

const nodes = [
  { id: "draft", position: { x: 0, y: 100 }, data: { label: "Draft" } },
  { id: "ghost", position: { x: 280, y: 100 }, data: { label: "Ghost target" } }
];

export default function ReactFlowTemporaryEdgeExample() {
  const [show, setShow] = useState(true);
  const edges: Edge[] = show ? [{ id: "temp", source: "draft", target: "ghost", animated: true, style: { strokeDasharray: "6 6" } }] : [];

  return (
    <div className="flow-shell">
      <button className="command-trigger" onClick={() => setShow((value) => !value)}>
        {show ? "Hide" : "Show"} Temporary Edge
      </button>
      <div className="flow-example">
        <ReactFlow nodes={nodes} edges={edges} fitView>
          <Background />
        </ReactFlow>
      </div>
    </div>
  );
}

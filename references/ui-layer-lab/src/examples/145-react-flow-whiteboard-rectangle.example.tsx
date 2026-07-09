import { Background, ReactFlow } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useState } from "react";

const nodes = [
  { id: "1", position: { x: 80, y: 80 }, data: { label: "Node A" } },
  { id: "2", position: { x: 340, y: 180 }, data: { label: "Node B" } }
];

export default function ReactFlowWhiteboardRectangleExample() {
  const [rect, setRect] = useState(true);

  return (
    <div className="flow-shell">
      <button className="command-trigger" onClick={() => setRect((value) => !value)}>
        {rect ? "Hide" : "Show"} Rectangle
      </button>
      <div className="flow-example">
        <ReactFlow nodes={nodes} edges={[]} fitView>
          <Background />
        </ReactFlow>
        {rect ? <div className="whiteboard-rect" /> : null}
      </div>
    </div>
  );
}

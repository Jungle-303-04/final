import { Background, ReactFlow } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useState } from "react";

const nodes = [
  { id: "1", position: { x: 80, y: 80 }, data: { label: "One" } },
  { id: "2", position: { x: 280, y: 160 }, data: { label: "Two" } }
];

export default function ReactFlowLassoSelectionExample() {
  const [lasso, setLasso] = useState(true);

  return (
    <div className="flow-shell">
      <button className="command-trigger" onClick={() => setLasso((value) => !value)}>
        {lasso ? "Hide" : "Show"} Lasso
      </button>
      <div className="flow-example">
        <ReactFlow nodes={nodes} edges={[]} fitView>
          <Background />
        </ReactFlow>
        {lasso ? <div className="lasso-rect" /> : null}
      </div>
    </div>
  );
}

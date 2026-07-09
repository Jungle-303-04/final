import { Background, ReactFlow } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useMemo, useState } from "react";

const nodes = [
  { id: "1", position: { x: 0, y: 100 }, data: { label: "Queued" } },
  { id: "2", position: { x: 260, y: 100 }, data: { label: "Running" } },
  { id: "3", position: { x: 520, y: 100 }, data: { label: "Done" } }
];

export default function ReactFlowAnimatedEdgeExample() {
  const [animated, setAnimated] = useState(true);
  const edges = useMemo(
    () => [
      { id: "1-2", source: "1", target: "2", animated },
      { id: "2-3", source: "2", target: "3", animated }
    ],
    [animated]
  );

  return (
    <div className="flow-shell">
      <button className="command-trigger" onClick={() => setAnimated((value) => !value)}>
        {animated ? "Stop animation" : "Start animation"}
      </button>
      <div className="flow-example">
        <ReactFlow nodes={nodes} edges={edges} fitView>
          <Background />
        </ReactFlow>
      </div>
    </div>
  );
}

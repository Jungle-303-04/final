import { Background, Controls, ReactFlow, useReactFlow, ReactFlowProvider, type Node } from "@xyflow/react";
import "@xyflow/react/dist/style.css";

const nodes: Node[] = [
  { id: "1", position: { x: -500, y: -200 }, data: { label: "Far left" } },
  { id: "2", position: { x: 0, y: 80 }, data: { label: "Center" } },
  { id: "3", position: { x: 600, y: 260 }, data: { label: "Far right" } }
];

const edges = [
  { id: "1-2", source: "1", target: "2" },
  { id: "2-3", source: "2", target: "3" }
];

export default function ReactFlowFitViewExample() {
  return (
    <ReactFlowProvider>
      <FitViewFlow />
    </ReactFlowProvider>
  );
}

function FitViewFlow() {
  const { fitView } = useReactFlow();

  return (
    <div className="flow-shell">
      <button className="command-trigger" onClick={() => fitView({ padding: 0.2 })}>
        Fit View
      </button>
      <div className="flow-example">
        <ReactFlow nodes={nodes} edges={edges}>
          <Background />
          <Controls />
        </ReactFlow>
      </div>
    </div>
  );
}

import { Background, ReactFlow, type Edge } from "@xyflow/react";
import "@xyflow/react/dist/style.css";

const nodes = [
  { id: "a", position: { x: 0, y: 100 }, data: { label: "Floating source" } },
  { id: "b", position: { x: 320, y: 160 }, data: { label: "Floating target" } }
];

const edges: Edge[] = [{ id: "a-b", source: "a", target: "b", type: "straight", animated: true }];

export default function ReactFlowFloatingEdgeExample() {
  return (
    <div className="flow-example">
      <ReactFlow nodes={nodes} edges={edges} fitView>
        <Background />
      </ReactFlow>
    </div>
  );
}

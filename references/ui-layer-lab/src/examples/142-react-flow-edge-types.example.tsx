import { Background, ReactFlow, type Edge } from "@xyflow/react";
import "@xyflow/react/dist/style.css";

const nodes = [
  { id: "a", position: { x: 0, y: 40 }, data: { label: "A" } },
  { id: "b", position: { x: 260, y: 40 }, data: { label: "B" } },
  { id: "c", position: { x: 0, y: 180 }, data: { label: "C" } },
  { id: "d", position: { x: 260, y: 180 }, data: { label: "D" } }
];

const edges: Edge[] = [
  { id: "a-b", source: "a", target: "b", type: "straight", label: "straight" },
  { id: "c-d", source: "c", target: "d", type: "smoothstep", label: "smoothstep" }
];

export default function ReactFlowEdgeTypesExample() {
  return (
    <div className="flow-example">
      <ReactFlow nodes={nodes} edges={edges} fitView>
        <Background />
      </ReactFlow>
    </div>
  );
}

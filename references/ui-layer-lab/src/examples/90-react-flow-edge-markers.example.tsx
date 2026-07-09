import { Background, MarkerType, ReactFlow } from "@xyflow/react";
import "@xyflow/react/dist/style.css";

const nodes = [
  { id: "1", position: { x: 0, y: 80 }, data: { label: "Build" } },
  { id: "2", position: { x: 260, y: 80 }, data: { label: "Deploy" } },
  { id: "3", position: { x: 520, y: 80 }, data: { label: "Verify" } }
];

const edges = [
  { id: "1-2", source: "1", target: "2", markerEnd: { type: MarkerType.ArrowClosed } },
  { id: "2-3", source: "2", target: "3", markerEnd: { type: MarkerType.ArrowClosed }, animated: true }
];

export default function ReactFlowEdgeMarkersExample() {
  return (
    <div className="flow-example">
      <ReactFlow nodes={nodes} edges={edges} fitView>
        <Background />
      </ReactFlow>
    </div>
  );
}

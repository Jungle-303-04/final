import { Background, Controls, MiniMap, ReactFlow, type Edge, type Node } from "@xyflow/react";
import "@xyflow/react/dist/style.css";

const nodes: Node[] = [
  { id: "1", position: { x: 0, y: 0 }, data: { label: "AI 입력" } },
  { id: "2", position: { x: 260, y: 80 }, data: { label: "계획" } },
  { id: "3", position: { x: 520, y: -30 }, data: { label: "Git 상태" } },
  { id: "4", position: { x: 520, y: 170 }, data: { label: "로그" } },
  { id: "5", position: { x: 780, y: 80 }, data: { label: "답변" } }
];

const edges: Edge[] = [
  { id: "1-2", source: "1", target: "2" },
  { id: "2-3", source: "2", target: "3" },
  { id: "2-4", source: "2", target: "4" },
  { id: "3-5", source: "3", target: "5" },
  { id: "4-5", source: "4", target: "5" }
];

export default function ReactFlowMinimapExample() {
  return (
    <div className="flow-example">
      <ReactFlow nodes={nodes} edges={edges} fitView>
        <Background />
        <MiniMap pannable zoomable />
        <Controls />
      </ReactFlow>
    </div>
  );
}

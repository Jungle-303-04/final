import { Background, type Edge } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { InteractiveReactFlow } from "./shared/InteractiveReactFlow";

const nodes = [
  { id: "a", position: { x: 0, y: 40 }, data: { label: "입력 A" } },
  { id: "b", position: { x: 260, y: 40 }, data: { label: "처리 B" } },
  { id: "c", position: { x: 0, y: 180 }, data: { label: "입력 C" } },
  { id: "d", position: { x: 260, y: 180 }, data: { label: "처리 D" } }
];

const edges: Edge[] = [
  { id: "a-b", source: "a", target: "b", type: "straight", label: "직선 엣지" },
  { id: "c-d", source: "c", target: "d", type: "smoothstep", label: "곡선 엣지" }
];

export default function ReactFlowEdgeTypesExample() {
  return (
    <div className="flow-example">
      <InteractiveReactFlow nodes={nodes} edges={edges} fitView>
        <Background />
      </InteractiveReactFlow>
    </div>
  );
}

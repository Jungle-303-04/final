import { Background, type Node } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { InteractiveReactFlow } from "./shared/InteractiveReactFlow";
import { useState } from "react";

const nodes: Node[] = [
  { id: "a", position: { x: 0, y: 80 }, data: { label: "입력" } },
  { id: "b", position: { x: 220, y: 80 }, data: { label: "처리" } },
  { id: "c", position: { x: 440, y: 80 }, data: { label: "결과" } }
];

export default function ReactFlowSelectionSummaryExample() {
  const [selected, setSelected] = useState("선택 없음");

  return (
    <div className="flow-shell">
      <span className="muted">선택: {selected}</span>
      <div className="flow-example">
        <InteractiveReactFlow
          nodes={nodes}
          edges={[]}
          onSelectionChange={({ nodes: selectedNodes }) => setSelected(selectedNodes.map((nodes) => String(nodes.data.label)).join(", ") || "선택 없음")}
          fitView
        >
          <Background />
        </InteractiveReactFlow>
      </div>
    </div>
  );
}

import { Background, Panel, type Node } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { InteractiveReactFlow } from "./shared/InteractiveReactFlow";
import { useState } from "react";

const nodes: Node[] = [
  { id: "1", position: { x: 160, y: 120 }, data: { label: "A" } },
  { id: "2", position: { x: 420, y: 120 }, data: { label: "B" } }
];

export default function ReactFlowSelectionModeSwitchExample() {
  const [mode, setMode] = useState<"노드" | "영역">("노드");

  return (
    <div className="flow-example">
      <InteractiveReactFlow nodes={nodes} edges={[]} fitView>
        <Background />
        <Panel position="top-right" className="flow-panel"><button onClick={() => setMode(mode === "노드" ? "영역" : "노드")} type="button">{mode}</button></Panel>
      </InteractiveReactFlow>
      {mode === "영역" ? <div className="lasso-rect" /> : null}
      <span className="flow-status">{mode} 선택 모드</span>
    </div>
  );
}

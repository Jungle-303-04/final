import { Background, Panel, type Node } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { InteractiveReactFlow } from "./shared/InteractiveReactFlow";
import { useState } from "react";

const baseNodes: Node[] = [
  { id: "1", position: { x: 130, y: 120 }, data: { label: "소스" } },
  { id: "2", position: { x: 360, y: 120 }, data: { label: "에이전트" } },
  { id: "3", position: { x: 590, y: 120 }, data: { label: "아티팩트" } }
];

export default function ReactFlowNodeCountPanelExample() {
  const [count, setCount] = useState(2);
  const nodes = baseNodes.slice(0, count);

  return (
    <div className="flow-example">
      <InteractiveReactFlow nodes={nodes} edges={[]} fitView>
        <Background />
        <Panel position="top-right" className="flow-panel"><button onClick={() => setCount(count === 2 ? 3 : 2)} type="button">노드 수 전환</button></Panel>
      </InteractiveReactFlow>
      <span className="flow-status">노드 {nodes.length}개</span>
    </div>
  );
}

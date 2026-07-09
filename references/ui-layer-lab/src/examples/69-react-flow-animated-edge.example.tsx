import { Background, ReactFlow } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useMemo, useState } from "react";

const nodes = [
  { id: "1", position: { x: 0, y: 100 }, data: { label: "대기" } },
  { id: "2", position: { x: 260, y: 100 }, data: { label: "실행 중" } },
  { id: "3", position: { x: 520, y: 100 }, data: { label: "완료" } }
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
      <button className="command-trigger stable-wide" onClick={() => setAnimated((value) => !value)} type="button">
        {animated ? "애니메이션 중지" : "애니메이션 시작"}
      </button>
      <div className="flow-example">
        <ReactFlow nodes={nodes} edges={edges} fitView>
          <Background />
        </ReactFlow>
      </div>
    </div>
  );
}

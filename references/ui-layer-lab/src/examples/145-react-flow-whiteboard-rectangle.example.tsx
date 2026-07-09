import { Background, ReactFlow } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useState } from "react";

const nodes = [
  { id: "1", position: { x: 80, y: 80 }, data: { label: "노드 가" } },
  { id: "2", position: { x: 340, y: 180 }, data: { label: "노드 나" } }
];

export default function ReactFlowWhiteboardRectangleExample() {
  const [rect, setRect] = useState(true);

  return (
    <div className="flow-shell">
      <button className="command-trigger stable-wide" onClick={() => setRect((value) => !value)} type="button">
        {rect ? "선택 영역 숨기기" : "선택 영역 보기"}
      </button>
      <div className="flow-example">
        <ReactFlow nodes={nodes} edges={[]} fitView>
          <Background />
        </ReactFlow>
        {rect ? <div className="whiteboard-rect" /> : null}
      </div>
    </div>
  );
}

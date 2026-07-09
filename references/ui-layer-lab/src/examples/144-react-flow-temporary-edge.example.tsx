import { Background, ReactFlow, type Edge } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useState } from "react";

const nodes = [
  { id: "draft", position: { x: 0, y: 100 }, data: { label: "초안" } },
  { id: "ghost", position: { x: 280, y: 100 }, data: { label: "임시 대상" } }
];

export default function ReactFlowTemporaryEdgeExample() {
  const [show, setShow] = useState(true);
  const edges: Edge[] = show ? [{ id: "temp", source: "draft", target: "ghost", animated: true, style: { strokeDasharray: "6 6" } }] : [];

  return (
    <div className="flow-shell">
      <button className="command-trigger stable-wide" onClick={() => setShow((value) => !value)} type="button">
        {show ? "임시 엣지 숨기기" : "임시 엣지 보기"}
      </button>
      <div className="flow-example">
        <ReactFlow nodes={nodes} edges={edges} fitView>
          <Background />
        </ReactFlow>
      </div>
    </div>
  );
}

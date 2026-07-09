import { Background, Panel, ReactFlow, useNodesState, type Node } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useState } from "react";

const initialNodes: Node[] = [
  { id: "1", position: { x: 120, y: 120 }, data: { label: "개요" } },
  { id: "2", position: { x: 360, y: 210 }, data: { label: "상세" } }
];

export default function ReactFlowContextualZoomExample() {
  const [nodes, , onNodesChange] = useNodesState(initialNodes);
  const [zoom, setZoom] = useState("개요");

  return (
    <div className="flow-example">
      <ReactFlow nodes={nodes} edges={[]} onNodesChange={onNodesChange} fitView>
        <Background />
        <Panel position="top-right" className="flow-panel">
          <button aria-pressed={zoom === "개요"} className="stable-wide" onClick={() => setZoom("개요")} type="button">개요</button>
          <button aria-pressed={zoom === "상세"} className="stable-wide" onClick={() => setZoom("상세")} type="button">상세</button>
        </Panel>
      </ReactFlow>
      <span aria-live="polite" className="flow-status">{zoom} 확대 상태</span>
    </div>
  );
}

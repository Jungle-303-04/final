import { Background, MiniMap, Panel, ReactFlow, type Node } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useState } from "react";
import { flowMiniMapMask, flowMiniMapMaskInverse, flowMiniMapNode, flowMiniMapNodeInverse } from "./shared/flowTheme";

const nodes: Node[] = [
  { id: "1", position: { x: 100, y: 100 }, data: { label: "입력" } },
  { id: "2", position: { x: 360, y: 160 }, data: { label: "처리" } },
  { id: "3", position: { x: 620, y: 100 }, data: { label: "출력" } }
];

export default function ReactFlowMinimapStyleSwitchExample() {
  const [inverse, setInverse] = useState(false);

  return (
    <div className="flow-example">
      <ReactFlow nodes={nodes} edges={[]} fitView>
        <Background />
        <MiniMap maskColor={inverse ? flowMiniMapMaskInverse : flowMiniMapMask} nodeColor={inverse ? flowMiniMapNodeInverse : flowMiniMapNode} />
        <Panel position="top-right" className="flow-panel">
          <button className="stable-wide" onClick={() => setInverse((value) => !value)} type="button">
            지도 반전
          </button>
        </Panel>
      </ReactFlow>
      <span className="flow-status">{inverse ? "반전" : "기본"} 미니맵</span>
    </div>
  );
}

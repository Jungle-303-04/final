import { Background, Panel, ReactFlow, type Edge, type Node } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useState } from "react";
import { flowEdgeFailed, flowEdgeHealthy } from "./shared/flowTheme";

const nodes: Node[] = [
  { id: "1", position: { x: 120, y: 120 }, data: { label: "빌드" } },
  { id: "2", position: { x: 360, y: 120 }, data: { label: "검사" } },
  { id: "3", position: { x: 600, y: 120 }, data: { label: "배포" } }
];

const allEdges: Edge[] = [
  { id: "1-2", source: "1", target: "2", animated: true, style: { stroke: flowEdgeHealthy } },
  { id: "2-3", source: "2", target: "3", animated: true, style: { stroke: flowEdgeFailed }, label: "실패" }
];

export default function ReactFlowEdgeHealthFilterExample() {
  const [failedOnly, setFailedOnly] = useState(false);
  const edges = failedOnly ? allEdges.filter((edge) => edge.label === "실패") : allEdges;

  return (
    <div className="flow-example">
      <ReactFlow nodes={nodes} edges={edges} fitView>
        <Background />
        <Panel position="top-right" className="flow-panel">
          <button className="stable-wide" onClick={() => setFailedOnly((value) => !value)} type="button">
            {failedOnly ? "전체 보기" : "실패 엣지"}
          </button>
        </Panel>
      </ReactFlow>
      <span className="flow-status">표시 중인 엣지 {edges.length}개</span>
    </div>
  );
}

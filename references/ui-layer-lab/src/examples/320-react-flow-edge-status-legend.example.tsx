import {
  Background,
  Panel,
  type Edge,
  type Node
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { InteractiveReactFlow } from "./shared/InteractiveReactFlow";
import { useState } from "react";
import { flowEdgeFailed, flowEdgeHealthy } from "./shared/flowTheme";

const nodes: Node[] = [
  { id: "pull", position: { x: 80, y: 150 }, data: { label: "가져오기" } },
  { id: "test", position: { x: 320, y: 80 }, data: { label: "검사" } },
  { id: "push", position: { x: 560, y: 150 }, data: { label: "게시" } }
];

const edges: Edge[] = [
  { id: "pull-test", source: "pull", target: "test", animated: true, style: { stroke: flowEdgeHealthy } },
  { id: "test-push", source: "test", target: "push", animated: true, style: { stroke: flowEdgeFailed } }
];

export default function ReactFlowEdgeStatusLegendExample() {
  const [showFailed, setShowFailed] = useState(true);
  const visibleEdges = showFailed ? edges : edges.slice(0, 1);

  return (
    <div className="flow-example">
      <InteractiveReactFlow nodes={nodes} edges={visibleEdges} fitView>
        <Background />
        <Panel position="top-right" className="flow-panel">
          <button className="stable-wide" onClick={() => setShowFailed((value) => !value)} type="button">
            {showFailed ? "실패 숨기기" : "실패 보기"}
          </button>
        </Panel>
      </InteractiveReactFlow>
      <span className="flow-status">표시 중인 엣지 {visibleEdges.length}개</span>
    </div>
  );
}

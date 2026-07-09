import { Background, Panel, ReactFlow, type Edge, type Node } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useState } from "react";

const nodes: Node[] = [
  { id: "pull", position: { x: 80, y: 150 }, data: { label: "pull" } },
  { id: "test", position: { x: 320, y: 80 }, data: { label: "test" } },
  { id: "push", position: { x: 560, y: 150 }, data: { label: "push" } }
];

const edges: Edge[] = [
  { id: "pull-test", source: "pull", target: "test", animated: true, style: { stroke: "#86efac" } },
  { id: "test-push", source: "test", target: "push", animated: true, style: { stroke: "#f87171" } }
];

export default function ReactFlowEdgeStatusLegendExample() {
  const [showFailed, setShowFailed] = useState(true);
  const visibleEdges = showFailed ? edges : edges.slice(0, 1);

  return (
    <div className="flow-example">
      <ReactFlow nodes={nodes} edges={visibleEdges} fitView>
        <Background />
        <Panel position="top-right" className="flow-panel">
          <button onClick={() => setShowFailed((value) => !value)}>{showFailed ? "Hide failed" : "Show failed"}</button>
        </Panel>
      </ReactFlow>
      <span className="flow-status">{visibleEdges.length} edges visible</span>
    </div>
  );
}

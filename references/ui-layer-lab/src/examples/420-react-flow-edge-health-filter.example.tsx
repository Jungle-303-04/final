import { Background, Panel, ReactFlow, type Edge, type Node } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useState } from "react";

const nodes: Node[] = [
  { id: "1", position: { x: 120, y: 120 }, data: { label: "build" } },
  { id: "2", position: { x: 360, y: 120 }, data: { label: "test" } },
  { id: "3", position: { x: 600, y: 120 }, data: { label: "deploy" } }
];

const allEdges: Edge[] = [
  { id: "1-2", source: "1", target: "2", animated: true, style: { stroke: "#86efac" } },
  { id: "2-3", source: "2", target: "3", animated: true, style: { stroke: "#f87171" }, label: "failed" }
];

export default function ReactFlowEdgeHealthFilterExample() {
  const [failedOnly, setFailedOnly] = useState(false);
  const edges = failedOnly ? allEdges.filter((edge) => edge.label === "failed") : allEdges;

  return (
    <div className="flow-example">
      <ReactFlow nodes={nodes} edges={edges} fitView>
        <Background />
        <Panel position="top-right" className="flow-panel">
          <button onClick={() => setFailedOnly((value) => !value)}>{failedOnly ? "Show all" : "Failed edge"}</button>
        </Panel>
      </ReactFlow>
      <span className="flow-status">{edges.length} edges visible</span>
    </div>
  );
}

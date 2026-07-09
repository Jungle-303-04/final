import { Background, Panel, ReactFlow, type Node } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useState } from "react";

const nodes: Node[] = [
  { id: "1", position: { x: 120, y: 120 }, data: { label: "Overview" } },
  { id: "2", position: { x: 360, y: 210 }, data: { label: "Detail" } }
];

export default function ReactFlowContextualZoomExample() {
  const [zoom, setZoom] = useState("Overview");

  return (
    <div className="flow-example">
      <ReactFlow nodes={nodes} edges={[]} fitView>
        <Background />
        <Panel position="top-right" className="flow-panel">
          <button onClick={() => setZoom("Overview")}>Overview</button>
          <button onClick={() => setZoom("Detail")}>Detail</button>
        </Panel>
      </ReactFlow>
      <span className="flow-status">{zoom} zoom</span>
    </div>
  );
}

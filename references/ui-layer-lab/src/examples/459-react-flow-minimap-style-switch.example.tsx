import { Background, MiniMap, Panel, ReactFlow, type Node } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useState } from "react";

const nodes: Node[] = [
  { id: "1", position: { x: 100, y: 100 }, data: { label: "input" } },
  { id: "2", position: { x: 360, y: 160 }, data: { label: "process" } },
  { id: "3", position: { x: 620, y: 100 }, data: { label: "output" } }
];

export default function ReactFlowMinimapStyleSwitchExample() {
  const [inverse, setInverse] = useState(false);

  return (
    <div className="flow-example">
      <ReactFlow nodes={nodes} edges={[]} fitView>
        <Background />
        <MiniMap maskColor={inverse ? "#09090b" : "#27272a"} nodeColor={inverse ? "#fafafa" : "#71717a"} />
        <Panel position="top-right" className="flow-panel"><button onClick={() => setInverse((value) => !value)}>Switch Map</button></Panel>
      </ReactFlow>
      <span className="flow-status">{inverse ? "inverse" : "default"} minimap</span>
    </div>
  );
}

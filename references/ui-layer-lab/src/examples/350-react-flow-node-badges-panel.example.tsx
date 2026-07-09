import { Background, Panel, ReactFlow, type Node } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useState } from "react";

const baseNodes: Node[] = [
  { id: "1", position: { x: 120, y: 120 }, data: { label: "planner" } },
  { id: "2", position: { x: 360, y: 120 }, data: { label: "coder" } },
  { id: "3", position: { x: 600, y: 120 }, data: { label: "reviewer" } }
];

export default function ReactFlowNodeBadgesPanelExample() {
  const [selected, setSelected] = useState("coder");

  return (
    <div className="flow-example">
      <ReactFlow nodes={baseNodes} edges={[]} fitView onNodeClick={(_, nodes) => setSelected(String(nodes.data.label))}>
        <Background />
        <Panel position="top-right" className="flow-panel">
          <button onClick={() => setSelected("reviewer")}>Reviewer</button>
        </Panel>
      </ReactFlow>
      <span className="flow-status">{selected} selected</span>
    </div>
  );
}

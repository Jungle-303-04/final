import { Background, Panel, ReactFlow, type Node } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useState } from "react";

const nodes: Node[] = [
  { id: "1", position: { x: 160, y: 120 }, data: { label: "input" } },
  { id: "2", position: { x: 420, y: 120 }, data: { label: "agent" } }
];

export default function ReactFlowDevtoolsToggleExample() {
  const [open, setOpen] = useState(false);

  return (
    <div className="flow-example">
      <ReactFlow nodes={nodes} edges={[]} fitView>
        <Background />
        <Panel position="top-right" className="flow-panel">
          <button onClick={() => setOpen((value) => !value)}>{open ? "Hide Devtools" : "Show Devtools"}</button>
        </Panel>
      </ReactFlow>
      {open ? <span className="flow-status">2 nodes inspected</span> : null}
    </div>
  );
}

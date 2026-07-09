import { Background, ReactFlow, type Node } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useState } from "react";

const baseNodes: Node[] = [
  { id: "a", position: { x: 120, y: 120 }, data: { label: "Plan" } },
  { id: "b", position: { x: 320, y: 120 }, data: { label: "Patch" } }
];

export default function ReactFlowSelectionGroupExample() {
  const [grouped, setGrouped] = useState(false);
  const nodes = grouped
    ? [{ id: "group", type: "group", position: { x: 80, y: 80 }, style: { width: 420, height: 160 }, data: { label: "" } }, ...baseNodes]
    : baseNodes;

  return (
    <div className="flow-shell">
      <button className="command-trigger" onClick={() => setGrouped((value) => !value)}>{grouped ? "Ungroup" : "Group"} Selection</button>
      <div className="flow-example">
        <ReactFlow nodes={nodes} edges={[]} fitView>
          <Background />
        </ReactFlow>
      </div>
    </div>
  );
}

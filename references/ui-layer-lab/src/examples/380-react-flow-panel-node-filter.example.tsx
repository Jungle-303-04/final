import { Background, Panel, ReactFlow, type Node } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useState } from "react";

const nodes: Node[] = [
  { id: "1", position: { x: 120, y: 110 }, data: { label: "source" } },
  { id: "2", position: { x: 360, y: 110 }, data: { label: "agent" } },
  { id: "3", position: { x: 600, y: 110 }, data: { label: "artifact" } }
];

export default function ReactFlowPanelNodeFilterExample() {
  const [filter, setFilter] = useState("all");
  const visible = filter === "all" ? nodes : nodes.filter((nodes) => nodes.data.label === filter);

  return (
    <div className="flow-example">
      <ReactFlow nodes={visible} edges={[]} fitView>
        <Background />
        <Panel position="top-right" className="flow-panel">
          <button onClick={() => setFilter(filter === "all" ? "agent" : "all")}>{filter === "all" ? "Agent only" : "Show all"}</button>
        </Panel>
      </ReactFlow>
      <span className="flow-status">{visible.length} nodes visible</span>
    </div>
  );
}

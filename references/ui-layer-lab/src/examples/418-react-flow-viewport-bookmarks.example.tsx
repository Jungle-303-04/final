import { Background, Panel, ReactFlow, type Node } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useState } from "react";

const nodes: Node[] = [
  { id: "1", position: { x: 20, y: 80 }, data: { label: "queue" } },
  { id: "2", position: { x: 360, y: 120 }, data: { label: "worker" } },
  { id: "3", position: { x: 720, y: 80 }, data: { label: "artifact" } }
];

export default function ReactFlowViewportBookmarksExample() {
  const [bookmark, setBookmark] = useState("queue");

  return (
    <div className="flow-example">
      <ReactFlow nodes={nodes} edges={[]} fitView>
        <Background />
        <Panel position="top-right" className="flow-panel">
          {["queue", "worker", "artifact"].map((item) => <button key={item} onClick={() => setBookmark(item)}>{item}</button>)}
        </Panel>
      </ReactFlow>
      <span className="flow-status">{bookmark} bookmark</span>
    </div>
  );
}

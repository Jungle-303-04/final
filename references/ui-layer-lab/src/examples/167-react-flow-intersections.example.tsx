import { Background, ReactFlow, type Node } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useState } from "react";

const nodes: Node[] = [
  { id: "a", position: { x: 120, y: 100 }, data: { label: "A" } },
  { id: "b", position: { x: 250, y: 130 }, data: { label: "B" } }
];

export default function ReactFlowIntersectionsExample() {
  const [intersecting, setIntersecting] = useState(false);

  return (
    <div className="flow-shell">
      <button className="command-trigger" onClick={() => setIntersecting((value) => !value)}>
        {intersecting ? "Clear" : "Mark"} Intersection
      </button>
      <div className={`flow-example ${intersecting ? "intersection-on" : ""}`}>
        <ReactFlow nodes={nodes} edges={[]} fitView>
          <Background />
        </ReactFlow>
      </div>
    </div>
  );
}

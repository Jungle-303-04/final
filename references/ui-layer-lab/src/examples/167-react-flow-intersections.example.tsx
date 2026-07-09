import { Background, ReactFlow, useNodesState, type Node } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useState } from "react";

const initialNodes: Node[] = [
  { id: "a", position: { x: 120, y: 100 }, data: { label: "노드 가" } },
  { id: "b", position: { x: 250, y: 130 }, data: { label: "노드 나" } }
];

export default function ReactFlowIntersectionsExample() {
  const [intersecting, setIntersecting] = useState(false);
  const [nodes, , onNodesChange] = useNodesState(initialNodes);

  return (
    <div className="flow-shell">
      <button className="command-trigger stable-wide" onClick={() => setIntersecting((value) => !value)} type="button">
        {intersecting ? "교차 표시 해제" : "교차 표시"}
      </button>
      <div className={`flow-example ${intersecting ? "intersection-on" : ""}`}>
        <ReactFlow nodes={nodes} edges={[]} onNodesChange={onNodesChange} fitView>
          <Background />
        </ReactFlow>
      </div>
    </div>
  );
}

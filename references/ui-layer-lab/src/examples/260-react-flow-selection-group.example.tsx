import { Background, ReactFlow, type Node, useNodesState } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useState } from "react";

const initialNodes: Node[] = [
  {
    id: "group",
    type: "group",
    position: { x: 80, y: 80 },
    style: { width: 420, height: 160 },
    data: { label: "" },
    hidden: true,
    draggable: false,
    selectable: false
  },
  { id: "a", position: { x: 120, y: 120 }, data: { label: "계획" } },
  { id: "b", position: { x: 320, y: 120 }, data: { label: "패치" } }
];

export default function ReactFlowSelectionGroupExample() {
  const [grouped, setGrouped] = useState(false);
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);

  function toggleGroup() {
    setGrouped((value) => {
      const next = !value;
      setNodes((items) => items.map((node) => (node.id === "group" ? { ...node, hidden: !next } : node)));
      return next;
    });
  }

  return (
    <div className="flow-shell">
      <button className="command-trigger stable-wide" onClick={toggleGroup} type="button">
        {grouped ? "묶음 해제" : "선택 묶기"}
      </button>
      <div className="flow-example">
        <ReactFlow nodes={nodes} edges={[]} fitView onNodesChange={onNodesChange}>
          <Background />
        </ReactFlow>
      </div>
    </div>
  );
}

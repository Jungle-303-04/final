import { Background, ReactFlow, type Node } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useState } from "react";

const nodes: Node[] = [
  { id: "pull", position: { x: 0, y: 80 }, data: { label: "Git Pull" } },
  { id: "test", position: { x: 260, y: 80 }, data: { label: "Typecheck" } }
];

const edges = [{ id: "pull-test", source: "pull", target: "test" }];

export default function ReactFlowContextMenuExample() {
  const [menu, setMenu] = useState<{ x: number; y: number; label: string } | null>(null);

  return (
    <div className="flow-menu-shell">
      <div className="flow-example">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onPaneClick={() => setMenu(null)}
          onNodeContextMenu={(event, nodes) => {
            event.preventDefault();
            const bounds = event.currentTarget.getBoundingClientRect();
            setMenu({ x: event.clientX - bounds.left, y: event.clientY - bounds.top, label: String(nodes.data.label) });
          }}
          fitView
        >
          <Background />
        </ReactFlow>
        {menu ? (
          <div className="flow-context-menu" style={{ left: menu.x, top: menu.y }}>
            <strong>{menu.label}</strong>
            <button>Open logs</button>
            <button>Retry step</button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

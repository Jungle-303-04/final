import { addEdge, Background, ReactFlow, useEdgesState, useNodesState, type Connection, type Node } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useCallback, useState } from "react";

const initialNodes: Node[] = [
  { id: "pull", position: { x: 0, y: 80 }, data: { label: "깃 동기화" } },
  { id: "test", position: { x: 260, y: 80 }, data: { label: "타입 검사" } }
];

const initialEdges = [{ id: "pull-test", source: "pull", target: "test" }];

export default function ReactFlowContextMenuExample() {
  const [nodes, , onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const [menu, setMenu] = useState<{ x: number; y: number; label: string } | null>(null);
  const onConnect = useCallback((connection: Connection) => setEdges((items) => addEdge(connection, items)), [setEdges]);

  return (
    <div className="flow-menu-shell">
      <div className="flow-example">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onConnect={onConnect}
          onEdgesChange={onEdgesChange}
          onNodesChange={onNodesChange}
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
            <button>로그 열기</button>
            <button>단계 재시도</button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

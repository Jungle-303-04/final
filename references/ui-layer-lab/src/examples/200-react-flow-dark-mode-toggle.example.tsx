import { Background, Panel, ReactFlow, useNodesState, type ColorMode, type Node } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useState } from "react";

const initialNodes: Node[] = [{ id: "1", position: { x: 180, y: 140 }, data: { label: "테마 모드" } }];

export default function ReactFlowDarkModeToggleExample() {
  const [mode, setMode] = useState<ColorMode>("dark");
  const [nodes, , onNodesChange] = useNodesState(initialNodes);

  return (
    <div className="flow-example">
      <ReactFlow colorMode={mode} nodes={nodes} edges={[]} onNodesChange={onNodesChange} fitView>
        <Background />
        <Panel position="top-right" className="flow-panel">
          <button aria-pressed={mode === "dark"} onClick={() => setMode("dark")} type="button">다크</button>
          <button aria-pressed={mode === "light"} onClick={() => setMode("light")} type="button">라이트</button>
        </Panel>
      </ReactFlow>
      <span className="flow-status">{mode === "dark" ? "다크 모드" : "라이트 모드"}</span>
    </div>
  );
}

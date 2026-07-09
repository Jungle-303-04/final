import { Background, Panel, ReactFlow, type ColorMode, type Node } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useState } from "react";

const nodes: Node[] = [{ id: "1", position: { x: 180, y: 140 }, data: { label: "Color mode" } }];

export default function ReactFlowDarkModeToggleExample() {
  const [mode, setMode] = useState<ColorMode>("dark");

  return (
    <div className="flow-example">
      <ReactFlow colorMode={mode} nodes={nodes} edges={[]} fitView>
        <Background />
        <Panel position="top-right" className="flow-panel">
          <button onClick={() => setMode("dark")}>Dark</button>
          <button onClick={() => setMode("light")}>Light</button>
        </Panel>
      </ReactFlow>
      <span className="flow-status">{mode} mode</span>
    </div>
  );
}

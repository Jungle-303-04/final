import { Background, ReactFlow } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useState } from "react";

const nodes = [{ id: "1", position: { x: 240, y: 140 }, data: { label: "Sketch note" } }];

export default function ReactFlowFreehandDrawExample() {
  const [draw, setDraw] = useState(true);

  return (
    <div className="flow-shell">
      <button className="command-trigger" onClick={() => setDraw((value) => !value)}>
        {draw ? "Hide" : "Show"} Drawing
      </button>
      <div className="flow-example">
        <ReactFlow nodes={nodes} edges={[]} fitView>
          <Background />
        </ReactFlow>
        {draw ? <svg className="freehand-path" viewBox="0 0 500 240"><path d="M60 130 C120 40 190 210 260 110 S390 80 440 150" /></svg> : null}
      </div>
    </div>
  );
}

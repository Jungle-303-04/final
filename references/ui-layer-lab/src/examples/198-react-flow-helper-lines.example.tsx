import { Background, ReactFlow, type Node } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useState } from "react";

const nodes: Node[] = [
  { id: "a", position: { x: 130, y: 120 }, data: { label: "Source" } },
  { id: "b", position: { x: 430, y: 220 }, data: { label: "Target" } }
];

export default function ReactFlowHelperLinesExample() {
  const [show, setShow] = useState(true);

  return (
    <div className="flow-shell">
      <button className="command-trigger" onClick={() => setShow((value) => !value)}>{show ? "Hide" : "Show"} Helper Lines</button>
      <div className="flow-example">
        <ReactFlow nodes={nodes} edges={[]} fitView>
          <Background />
        </ReactFlow>
        {show ? <><span className="helper-line x" /><span className="helper-line y" /></> : null}
      </div>
    </div>
  );
}

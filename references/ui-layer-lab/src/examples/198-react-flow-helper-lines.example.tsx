import { Background, ReactFlow, useNodesState, type Node } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useState } from "react";

const initialNodes: Node[] = [
  { id: "a", position: { x: 130, y: 120 }, data: { label: "소스" } },
  { id: "b", position: { x: 430, y: 220 }, data: { label: "대상" } }
];

export default function ReactFlowHelperLinesExample() {
  const [show, setShow] = useState(true);
  const [nodes, , onNodesChange] = useNodesState(initialNodes);

  return (
    <div className="flow-shell">
      <button
        aria-pressed={show}
        className="command-trigger stable-wide"
        onClick={() => setShow((value) => !value)}
        type="button"
      >
        {show ? "가이드 숨기기" : "가이드 표시"}
      </button>
      <div className="flow-example">
        <ReactFlow nodes={nodes} edges={[]} onNodesChange={onNodesChange} fitView>
          <Background />
        </ReactFlow>
        {show ? <><span className="helper-line x" /><span className="helper-line y" /></> : null}
      </div>
    </div>
  );
}

import { Background, ReactFlow, useNodesState, type Node } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useState } from "react";

const initialNodes: Node[] = [
  { id: "1", position: { x: 80, y: 80 }, data: { label: "첫 번째" } },
  { id: "2", position: { x: 280, y: 160 }, data: { label: "두 번째" } }
];

export default function ReactFlowLassoSelectionExample() {
  const [lasso, setLasso] = useState(true);
  const [nodes, , onNodesChange] = useNodesState(initialNodes);

  return (
    <div className="flow-shell">
      <button className="command-trigger stable-wide" onClick={() => setLasso((value) => !value)} type="button">
        {lasso ? "라쏘 숨기기" : "라쏘 보기"}
      </button>
      <div className="flow-example">
        <ReactFlow nodes={nodes} edges={[]} onNodesChange={onNodesChange} fitView>
          <Background />
        </ReactFlow>
        {lasso ? <div className="lasso-rect" /> : null}
      </div>
    </div>
  );
}

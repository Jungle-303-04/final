import { Background, ReactFlow, useNodesState, type Node } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useState } from "react";

const initialNodes: Node[] = [{ id: "1", position: { x: 240, y: 140 }, data: { label: "스케치 메모" } }];

export default function ReactFlowFreehandDrawExample() {
  const [draw, setDraw] = useState(true);
  const [nodes, , onNodesChange] = useNodesState(initialNodes);

  return (
    <div className="flow-shell">
      <button className="command-trigger stable-wide" onClick={() => setDraw((value) => !value)} type="button">
        {draw ? "드로잉 숨기기" : "드로잉 보기"}
      </button>
      <div className="flow-example">
        <ReactFlow nodes={nodes} edges={[]} onNodesChange={onNodesChange} fitView>
          <Background />
        </ReactFlow>
        {draw ? <svg className="freehand-path" viewBox="0 0 500 240"><path d="M60 130 C120 40 190 210 260 110 S390 80 440 150" /></svg> : null}
      </div>
    </div>
  );
}

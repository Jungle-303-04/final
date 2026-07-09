import { Background, ReactFlow, type Node } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useState } from "react";

const baseNode: Node = { id: "1", position: { x: 180, y: 150 }, data: { label: "Undoable nodes" } };

export default function ReactFlowUndoRedoExample() {
  const [x, setX] = useState(180);
  const nodes = { ...baseNode, position: { x, y: 150 } };

  return (
    <div className="flow-shell">
      <div className="flow-panel">
        <button onClick={() => setX(300)}>Move</button>
        <button onClick={() => setX(180)}>Undo</button>
      </div>
      <div className="flow-example">
        <ReactFlow nodes={[nodes]} edges={[]} fitView>
          <Background />
        </ReactFlow>
      </div>
    </div>
  );
}

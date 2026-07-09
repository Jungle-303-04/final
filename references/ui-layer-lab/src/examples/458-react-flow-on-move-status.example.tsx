import { Background, Panel, type Node } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { InteractiveReactFlow } from "./shared/InteractiveReactFlow";
import { useState } from "react";

const nodes: Node[] = [
  { id: "1", position: { x: 200, y: 130 }, data: { label: "viewport" } }
];

export default function ReactFlowOnMoveStatusExample() {
  const [moves, setMoves] = useState(0);

  return (
    <div className="flow-example">
      <InteractiveReactFlow nodes={nodes} edges={[]} fitView onMoveEnd={() => setMoves((value) => value + 1)}>
        <Background />
        <Panel position="top-right" className="flow-panel"><button onClick={() => setMoves((value) => value + 1)}>Move</button></Panel>
      </InteractiveReactFlow>
      <span className="flow-status">{moves} viewport moves</span>
    </div>
  );
}

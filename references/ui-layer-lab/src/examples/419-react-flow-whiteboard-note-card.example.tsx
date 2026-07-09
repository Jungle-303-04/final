import { Background, type Node } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { InteractiveReactFlow } from "./shared/InteractiveReactFlow";
import { useState } from "react";

const nodes: Node[] = [
  { id: "1", position: { x: 180, y: 130 }, data: { label: "planner" } },
  { id: "2", position: { x: 480, y: 130 }, data: { label: "reviewer" } }
];

export default function ReactFlowWhiteboardNoteCardExample() {
  const [visible, setVisible] = useState(true);

  return (
    <div className="flow-example">
      <InteractiveReactFlow nodes={nodes} edges={[]} fitView>
        <Background />
      </InteractiveReactFlow>
      {visible ? <aside className="whiteboard-rect">Review before push</aside> : null}
      <button className="command-trigger floating-action" onClick={() => setVisible((value) => !value)}>
        Toggle Note
      </button>
    </div>
  );
}

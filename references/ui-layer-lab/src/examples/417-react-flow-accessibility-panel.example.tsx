import { Background, Panel, type Node } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { InteractiveReactFlow } from "./shared/InteractiveReactFlow";
import { useState } from "react";

const nodes: Node[] = [
  { id: "1", position: { x: 120, y: 120 }, data: { label: "source" } },
  { id: "2", position: { x: 360, y: 120 }, data: { label: "transform" } },
  { id: "3", position: { x: 600, y: 120 }, data: { label: "output" } }
];

export default function ReactFlowAccessibilityPanelExample() {
  const [active, setActive] = useState("source");

  return (
    <div className="flow-example">
      <InteractiveReactFlow nodes={nodes} edges={[]} fitView aria-label="Accessible workflow">
        <Background />
        <Panel position="top-left" className="flow-panel">
          {nodes.map((nodes) => <button key={nodes.id} onClick={() => setActive(String(nodes.data.label))}>{String(nodes.data.label)}</button>)}
        </Panel>
      </InteractiveReactFlow>
      <span className="flow-status">{active} focused</span>
    </div>
  );
}

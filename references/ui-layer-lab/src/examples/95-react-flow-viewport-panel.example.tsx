import { Background, Panel, ReactFlow, useReactFlow } from "@xyflow/react";
import "@xyflow/react/dist/style.css";

const nodes = [
  { id: "1", position: { x: 0, y: 80 }, data: { label: "Top layer" } },
  { id: "2", position: { x: 360, y: 220 }, data: { label: "Detail" } }
];

const edges = [{ id: "1-2", source: "1", target: "2" }];

export default function ReactFlowViewportPanelExample() {
  return (
    <div className="flow-example">
      <ReactFlow nodes={nodes} edges={edges} fitView>
        <Background />
        <ViewportButtons />
      </ReactFlow>
    </div>
  );
}

function ViewportButtons() {
  const { zoomIn, zoomOut, fitView } = useReactFlow();

  return (
    <Panel position="top-right" className="flow-panel">
      <button onClick={() => zoomIn()}>+</button>
      <button onClick={() => zoomOut()}>-</button>
      <button onClick={() => fitView()}>fit</button>
    </Panel>
  );
}

import { Background, Panel, ReactFlow } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useState } from "react";

const nodes = [{ id: "1", position: { x: 160, y: 120 }, data: { label: "Exportable flow" } }];

export default function ReactFlowDownloadPanelExample() {
  const [message, setMessage] = useState("Ready to export");

  return (
    <div className="flow-example">
      <ReactFlow nodes={nodes} edges={[]} fitView>
        <Background />
        <Panel position="top-right" className="flow-panel">
          <button onClick={() => setMessage("PNG export queued")}>PNG</button>
          <button onClick={() => setMessage("JSON export queued")}>JSON</button>
        </Panel>
      </ReactFlow>
      <span className="flow-status">{message}</span>
    </div>
  );
}

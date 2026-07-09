import { Background, Panel, ReactFlow, useNodesState, type Node } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useState } from "react";

const initialNodes: Node[] = [{ id: "1", position: { x: 160, y: 120 }, data: { label: "내보내기 플로우" } }];

export default function ReactFlowDownloadPanelExample() {
  const [message, setMessage] = useState("내보내기 준비됨");
  const [nodes, , onNodesChange] = useNodesState(initialNodes);

  return (
    <div className="flow-example">
      <ReactFlow nodes={nodes} edges={[]} onNodesChange={onNodesChange} fitView>
        <Background />
        <Panel position="top-right" className="flow-panel">
          <button onClick={() => setMessage("PNG 내보내기 대기열에 추가됨")} type="button">PNG</button>
          <button onClick={() => setMessage("JSON 내보내기 대기열에 추가됨")} type="button">JSON</button>
        </Panel>
      </ReactFlow>
      <span className="flow-status">{message}</span>
    </div>
  );
}

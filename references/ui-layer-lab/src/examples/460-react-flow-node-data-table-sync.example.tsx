import { Background, Panel, ReactFlow, type Node } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useState } from "react";

const nodes: Node[] = [
  { id: "1", position: { x: 120, y: 120 }, data: { label: "빌드" } },
  { id: "2", position: { x: 380, y: 120 }, data: { label: "테스트" } },
  { id: "3", position: { x: 640, y: 120 }, data: { label: "배포" } }
];

export default function ReactFlowNodeDataTableSyncExample() {
  const [selected, setSelected] = useState("빌드");

  return (
    <div className="flow-example">
      <ReactFlow nodes={nodes} edges={[]} fitView onNodeClick={(_, nodes) => setSelected(String(nodes.data.label))}>
        <Background />
        <Panel position="top-left" className="flow-panel">
          {nodes.map((nodes) => <button key={nodes.id} onClick={() => setSelected(String(nodes.data.label))}>{String(nodes.data.label)}</button>)}
        </Panel>
      </ReactFlow>
      <span className="flow-status">{selected} 행 선택됨</span>
    </div>
  );
}

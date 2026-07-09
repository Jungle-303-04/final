import { Background, Controls, ReactFlow, type Node } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useState } from "react";

const nodes: Node[] = [
  { id: "input", position: { x: 0, y: 80 }, data: { label: "AI 입력" } },
  { id: "logs", position: { x: 260, y: 80 }, data: { label: "로그 조회" } },
  { id: "answer", position: { x: 520, y: 80 }, data: { label: "답변 생성" } }
];

const edges = [
  { id: "input-logs", source: "input", target: "logs" },
  { id: "logs-answer", source: "logs", target: "answer" }
];

export default function ReactFlowInspectorExample() {
  const [selected, setSelected] = useState<Node | null>(nodes[0]);

  return (
    <div className="flow-inspector-layout">
      <div className="flow-example">
        <ReactFlow nodes={nodes} edges={edges} onNodeClick={(_, nodes) => setSelected(nodes)} fitView>
          <Background />
          <Controls />
        </ReactFlow>
      </div>
      <aside className="detail-panel">
        <strong>{String(selected?.data.label ?? "선택 없음")}</strong>
        <span>ID: {selected?.id ?? "-"}</span>
        <span>로그, 지표, 후속 액션을 이 패널에 연결합니다.</span>
      </aside>
    </div>
  );
}

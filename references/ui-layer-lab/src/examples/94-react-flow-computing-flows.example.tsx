import { Background, ReactFlow, type Edge, type Node } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useMemo, useState } from "react";

const nodes: Node[] = [
  { id: "input", position: { x: 0, y: 80 }, data: { label: "입력" } },
  { id: "lint", position: { x: 240, y: 30 }, data: { label: "린트" } },
  { id: "test", position: { x: 240, y: 150 }, data: { label: "테스트" } },
  { id: "ship", position: { x: 500, y: 90 }, data: { label: "배포" } }
];

const edges: Edge[] = [
  { id: "input-lint", source: "input", target: "lint" },
  { id: "input-test", source: "input", target: "test" },
  { id: "lint-ship", source: "lint", target: "ship" },
  { id: "test-ship", source: "test", target: "ship" }
];

const labelsById = Object.fromEntries(nodes.map((node) => [node.id, String(node.data.label)]));

export default function ReactFlowComputingFlowsExample() {
  const [selected, setSelected] = useState("input");
  const outgoing = useMemo(() => edges.filter((edge) => edge.source === selected).map((edge) => labelsById[edge.target]), [selected]);

  return (
    <div className="flow-inspector-layout">
      <div className="flow-example">
        <ReactFlow nodes={nodes} edges={edges} onNodeClick={(_, node) => setSelected(node.id)} fitView>
          <Background />
        </ReactFlow>
      </div>
      <aside className="detail-panel">
        <strong>{labelsById[selected]}</strong>
        <span>다음 단계: {outgoing.join(", ") || "없음"}</span>
      </aside>
    </div>
  );
}

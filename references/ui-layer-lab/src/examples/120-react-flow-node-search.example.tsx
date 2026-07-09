import { Background, ReactFlow, useReactFlow } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useState } from "react";

const nodes = [
  { id: "input", position: { x: 0, y: 100 }, data: { label: "입력" } },
  { id: "logs", position: { x: 240, y: 20 }, data: { label: "로그" } },
  { id: "answer", position: { x: 500, y: 120 }, data: { label: "답변" } }
];

const edges = [
  { id: "input-logs", source: "input", target: "logs" },
  { id: "logs-answer", source: "logs", target: "answer" }
];

export default function ReactFlowNodeSearchExample() {
  return (
    <div className="flow-example">
      <ReactFlow nodes={nodes} edges={edges} fitView>
        <Background />
        <NodeSearch />
      </ReactFlow>
    </div>
  );
}

function NodeSearch() {
  const [query, setQuery] = useState("logs");
  const { fitView } = useReactFlow();

  function focusNode() {
    fitView({ nodes: [{ id: query }], duration: 300 });
  }

  return (
    <div className="nodes-search-panel">
      <input value={query} onChange={(event) => setQuery(event.target.value)} />
      <button onClick={focusNode} type="button">초점 이동</button>
    </div>
  );
}

import { Background, ReactFlow, type Edge, type Node } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useMemo, useState } from "react";

const nodes: Node[] = [
  { id: "input", position: { x: 0, y: 80 }, data: { label: "Input" } },
  { id: "lint", position: { x: 240, y: 30 }, data: { label: "Lint" } },
  { id: "test", position: { x: 240, y: 150 }, data: { label: "Test" } },
  { id: "ship", position: { x: 500, y: 90 }, data: { label: "Ship" } }
];

const edges: Edge[] = [
  { id: "input-lint", source: "input", target: "lint" },
  { id: "input-test", source: "input", target: "test" },
  { id: "lint-ship", source: "lint", target: "ship" },
  { id: "test-ship", source: "test", target: "ship" }
];

export default function ReactFlowComputingFlowsExample() {
  const [selected, setSelected] = useState("input");
  const outgoing = useMemo(() => edges.filter((edge) => edge.source === selected).map((edge) => edge.target), [selected]);

  return (
    <div className="flow-inspector-layout">
      <div className="flow-example">
        <ReactFlow nodes={nodes} edges={edges} onNodeClick={(_, nodes) => setSelected(nodes.id)} fitView>
          <Background />
        </ReactFlow>
      </div>
      <aside className="detail-panel">
        <strong>{selected}</strong>
        <span>outgoing: {outgoing.join(", ") || "none"}</span>
      </aside>
    </div>
  );
}

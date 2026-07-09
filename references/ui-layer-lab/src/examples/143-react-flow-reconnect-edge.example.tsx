import { Background, ReactFlow, useEdgesState, type Edge } from "@xyflow/react";
import "@xyflow/react/dist/style.css";

const nodes = [
  { id: "source", position: { x: 0, y: 120 }, data: { label: "Source" } },
  { id: "a", position: { x: 320, y: 60 }, data: { label: "Target A" } },
  { id: "b", position: { x: 320, y: 190 }, data: { label: "Target B" } }
];

const initialEdges: Edge[] = [{ id: "source-a", source: "source", target: "a" }];

export default function ReactFlowReconnectEdgeExample() {
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const target = edges[0]?.target ?? "a";

  function reconnect() {
    setEdges([{ id: "source-next", source: "source", target: target === "a" ? "b" : "a", animated: true }]);
  }

  return (
    <div className="flow-shell">
      <button className="command-trigger" onClick={reconnect}>Reconnect to {target === "a" ? "B" : "A"}</button>
      <div className="flow-example">
        <ReactFlow nodes={nodes} edges={edges} onEdgesChange={onEdgesChange} fitView>
          <Background />
        </ReactFlow>
      </div>
    </div>
  );
}

import { Background, ReactFlow, useEdgesState, type Edge } from "@xyflow/react";
import "@xyflow/react/dist/style.css";

const nodes = [
  { id: "source", position: { x: 0, y: 120 }, data: { label: "시작 노드" } },
  { id: "a", position: { x: 320, y: 60 }, data: { label: "대상 A" } },
  { id: "b", position: { x: 320, y: 190 }, data: { label: "대상 B" } }
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
      <div className="flow-toolbar">
        <span>현재 연결: {target === "a" ? "대상 A" : "대상 B"}</span>
        <button className="command-trigger stable-wide" onClick={reconnect} type="button">
          연결 대상 전환
        </button>
      </div>
      <div className="flow-example">
        <ReactFlow nodes={nodes} edges={edges} onEdgesChange={onEdgesChange} fitView>
          <Background />
        </ReactFlow>
      </div>
    </div>
  );
}

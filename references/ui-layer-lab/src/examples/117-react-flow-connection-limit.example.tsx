import { Background, Handle, Position, ReactFlow, type Node, type NodeProps } from "@xyflow/react";
import "@xyflow/react/dist/style.css";

type LimitNode = Node<{ label: string; limit?: boolean }, "limit">;

const nodes: LimitNode[] = [
  { id: "1", type: "limit", position: { x: 0, y: 100 }, data: { label: "출력 1개", limit: true } },
  { id: "2", type: "limit", position: { x: 300, y: 40 }, data: { label: "대상 A" } },
  { id: "3", type: "limit", position: { x: 300, y: 180 }, data: { label: "대상 B" } }
];

const edges = [{ id: "1-2", source: "1", target: "2" }];
const nodeTypes = { limit: LimitCard };

export default function ReactFlowConnectionLimitExample() {
  return (
    <div className="flow-example">
      <ReactFlow nodes={nodes} edges={edges} nodeTypes={nodeTypes} fitView>
        <Background />
      </ReactFlow>
    </div>
  );
}

function LimitCard({ data }: NodeProps<LimitNode>) {
  return (
    <div className="flow-card">
      <Handle type="target" position={Position.Left} />
      <strong>{data.label}</strong>
      <span>{data.limit ? "출력 핸들 연결 제한" : "연결 가능한 대상"}</span>
      <Handle type="source" position={Position.Right} isConnectable={!data.limit} />
    </div>
  );
}

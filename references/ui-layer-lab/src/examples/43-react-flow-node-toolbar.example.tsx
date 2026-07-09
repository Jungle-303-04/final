import {
  Background,
  Controls,
  Handle,
  NodeToolbar,
  Position,
  type Node,
  type NodeProps
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { InteractiveReactFlow } from "./shared/InteractiveReactFlow";

type ToolbarNode = Node<{ label: string }, "toolcard">;

const nodes: ToolbarNode[] = [
  { id: "1", type: "toolcard", position: { x: 0, y: 80 }, data: { label: "검토 단계" } },
  { id: "2", type: "toolcard", position: { x: 260, y: 80 }, data: { label: "로그 열기" } }
];

const edges = [{ id: "1-2", source: "1", target: "2" }];

const nodeTypes = {
  toolcard: ToolbarCard
};

export default function ReactFlowNodeToolbarExample() {
  return (
    <div className="flow-example">
      <InteractiveReactFlow nodes={nodes} edges={edges} nodeTypes={nodeTypes} fitView>
        <Background />
        <Controls />
      </InteractiveReactFlow>
    </div>
  );
}

function ToolbarCard({ data }: NodeProps<ToolbarNode>) {
  return (
    <div className="flow-card">
      <NodeToolbar isVisible position={Position.Top}>
        <button type="button">집중</button>
        <button type="button">로그</button>
      </NodeToolbar>
      <Handle type="target" position={Position.Left} />
      <strong>{data.label}</strong>
      <span>노드 위에서 바로 작업을 실행합니다.</span>
      <Handle type="source" position={Position.Right} />
    </div>
  );
}

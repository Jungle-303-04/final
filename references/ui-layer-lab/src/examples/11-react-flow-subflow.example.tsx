import {
  Background,
  Controls,
  Handle,
  Position,
  ReactFlow,
  type Node,
  type NodeProps
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
type StepNode = Node<{ title: string; status: string }, "step">;
type GroupNode = Node<{ label: string }, "group">;

const nodes: Array<StepNode | GroupNode> = [
  {
    id: "quality",
    type: "group",
    position: { x: 120, y: 40 },
    data: { label: "품질 단계" },
    style: { width: 520, height: 230 }
  },
  step("typecheck", "타입 검사", "통과", 40, 80, "quality"),
  step("visual", "시각 스모크", "실패", 280, 80, "quality"),
  step("deploy", "배포", "대기", 760, 120)
];

const edges = [
  { id: "typecheck-visual", source: "typecheck", target: "visual" },
  { id: "visual-deploy", source: "visual", target: "deploy", animated: true }
];

const nodeTypes = {
  step: StepCard
};

export default function ReactFlowSubflowExample() {
  return (
    <div className="flow-example">
      <ReactFlow nodes={nodes} edges={edges} nodeTypes={nodeTypes} fitView>
        <Background />
        <Controls />
      </ReactFlow>
    </div>
  );
}

function StepCard({ data }: NodeProps<StepNode>) {
  return (
    <div className="flow-card">
      <Handle type="target" position={Position.Left} />
      <strong>{data.title}</strong>
      <span>{data.status}</span>
      <Handle type="source" position={Position.Right} />
    </div>
  );
}

function step(id: string, title: string, status: string, x: number, y: number, parentId?: string): StepNode {
  return {
    id,
    type: "step",
    parentId,
    extent: parentId ? "parent" : undefined,
    position: { x, y },
    data: { title, status }
  };
}

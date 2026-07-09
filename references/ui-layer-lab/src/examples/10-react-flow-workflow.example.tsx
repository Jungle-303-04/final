import {
  Background,
  Controls,
  Handle,
  Position,
  ReactFlow,
  type NodeProps,
  type Node
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
type WorkflowNode = Node<{ title: string; detail: string }, "workflow">;

const nodes: WorkflowNode[] = [
  node("input", "AI Input", "User asks a question", 0, 90),
  node("job", "Job Center", "Track git pull progress", 260, 90),
  node("log", "Drilldown Log", "Open failed step logs", 520, 90)
];

const edges = [
  { id: "input-job", source: "input", target: "job", animated: true },
  { id: "job-log", source: "job", target: "log", animated: true }
];

const nodeTypes = {
  workflow: WorkflowCard
};

export default function ReactFlowWorkflowExample() {
  return (
    <div className="flow-example">
      <ReactFlow nodes={nodes} edges={edges} nodeTypes={nodeTypes} fitView>
        <Background />
        <Controls />
      </ReactFlow>
    </div>
  );
}

function WorkflowCard({ data }: NodeProps<WorkflowNode>) {
  return (
    <div className="flow-card">
      <Handle type="target" position={Position.Left} />
      <strong>{data.title}</strong>
      <span>{data.detail}</span>
      <Handle type="source" position={Position.Right} />
    </div>
  );
}

function node(id: string, title: string, detail: string, x: number, y: number): WorkflowNode {
  return {
    id,
    type: "workflow",
    position: { x, y },
    data: { title, detail }
  };
}

import { Background, Controls, Handle, NodeToolbar, Position, ReactFlow, type Node, type NodeProps } from "@xyflow/react";
import "@xyflow/react/dist/style.css";

type ToolbarNode = Node<{ label: string }, "toolcard">;

const nodes: ToolbarNode[] = [
  { id: "1", type: "toolcard", position: { x: 0, y: 80 }, data: { label: "Select me" } },
  { id: "2", type: "toolcard", position: { x: 260, y: 80 }, data: { label: "Open logs" } }
];

const edges = [{ id: "1-2", source: "1", target: "2" }];

const nodeTypes = {
  toolcard: ToolbarCard
};

export default function ReactFlowNodeToolbarExample() {
  return (
    <div className="flow-example">
      <ReactFlow nodes={nodes} edges={edges} nodeTypes={nodeTypes} fitView>
        <Background />
        <Controls />
      </ReactFlow>
    </div>
  );
}

function ToolbarCard({ data }: NodeProps<ToolbarNode>) {
  return (
    <div className="flow-card">
      <NodeToolbar isVisible position={Position.Top}>
        <button>Focus</button>
        <button>Logs</button>
      </NodeToolbar>
      <Handle type="target" position={Position.Left} />
      <strong>{data.label}</strong>
      <span>Click the nodes to show toolbar.</span>
      <Handle type="source" position={Position.Right} />
    </div>
  );
}

import { Background, Handle, NodeResizer, Position, ReactFlow, type Node, type NodeProps } from "@xyflow/react";
import "@xyflow/react/dist/style.css";

type ResizableNode = Node<{ label: string }, "resizable">;

const nodes: ResizableNode[] = [
  { id: "1", type: "resizable", position: { x: 100, y: 80 }, data: { label: "Resizable Node" }, selected: true }
];

const nodeTypes = { resizable: ResizableCard };

export default function ReactFlowNodeResizerExample() {
  return (
    <div className="flow-example">
      <ReactFlow nodes={nodes} edges={[]} nodeTypes={nodeTypes} fitView>
        <Background />
      </ReactFlow>
    </div>
  );
}

function ResizableCard({ data, selected }: NodeProps<ResizableNode>) {
  return (
    <div className="flow-card resizable-card">
      <NodeResizer isVisible={selected} minWidth={160} minHeight={90} />
      <Handle type="target" position={Position.Left} />
      <strong>{data.label}</strong>
      <span>Drag the handles to resize.</span>
      <Handle type="source" position={Position.Right} />
    </div>
  );
}

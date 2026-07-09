import { Background, ReactFlow, useNodesState, type Edge, type Node } from "@xyflow/react";
import "@xyflow/react/dist/style.css";

const initialNodes: Node[] = [
  { id: "a", position: { x: 0, y: 100 }, data: { label: "출발 노드" } },
  { id: "b", position: { x: 320, y: 160 }, data: { label: "도착 노드" } }
];

const edges: Edge[] = [{ id: "a-b", source: "a", target: "b", type: "straight", animated: true }];

export default function ReactFlowFloatingEdgeExample() {
  const [nodes, , onNodesChange] = useNodesState(initialNodes);

  return (
    <div className="flow-example">
      <ReactFlow nodes={nodes} edges={edges} onNodesChange={onNodesChange} fitView>
        <Background />
      </ReactFlow>
    </div>
  );
}
